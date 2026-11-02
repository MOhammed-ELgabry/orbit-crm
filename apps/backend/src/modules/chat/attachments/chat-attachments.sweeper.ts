import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { errorName } from '../chat.utils';

import type { AttachmentStorage } from './attachment-storage.interface';
import type { ChatAttachmentsConfig } from './chat-attachments.config';
import {
  CHAT_ATTACHMENTS_CONFIG,
  CHAT_ATTACHMENTS_REPOSITORY,
  CHAT_ATTACHMENTS_STORAGE,
  EXPIRED_ROW_RETENTION_MS,
  STALE_TEMP_MAX_AGE_MS,
  SWEEP_GRACE_MS,
} from './chat-attachments.constants';
import type { IChatAttachmentsRepository } from './chat-attachments.repository';

export interface SweepSummary {
  /** UPLOADING / READY rows turned EXPIRED (their files removed). */
  expired: number;
  /** Leftover temporary `.part` files removed. */
  tempFiles: number;
  /** Old EXPIRED rows deleted (after their files were removed). */
  rowsDeleted: number;
  /** File removals that failed (they are retried by a later run). */
  failures: number;
}

/**
 * Bounded housekeeping for attachments that were never sent.
 *
 *  - never touches an ATTACHED row or its file (there is no code path from
 *    here to one: every statement filters on the UPLOADING/READY/EXPIRED
 *    statuses, and the database triggers refuse the rest);
 *  - at most `sweepBatchSize` rows and files per run, never a disk scan;
 *  - safe with several API instances (rows are claimed with SKIP LOCKED);
 *  - the in-process timer is only started when the feature is on and
 *    CHAT_ATTACHMENTS_SWEEP_INTERVAL_MS > 0; `runOnce()` can also be called
 *    by an external scheduler.
 *
 * Logs contain counts and error names only - never names, keys or paths.
 */
@Injectable()
export class ChatAttachmentsSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatAttachmentsSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(CHAT_ATTACHMENTS_CONFIG)
    private readonly config: ChatAttachmentsConfig,
    @Inject(CHAT_ATTACHMENTS_STORAGE)
    private readonly storage: AttachmentStorage | null,
    @Inject(CHAT_ATTACHMENTS_REPOSITORY)
    private readonly repository: IChatAttachmentsRepository,
  ) {}

  onModuleInit(): void {
    if (
      !this.config.enabled ||
      this.config.sweepIntervalMs <= 0 ||
      process.env.NODE_ENV === 'test'
    ) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) =>
        this.logger.warn(`Attachment sweep failed (${errorName(error)})`),
      );
    }, this.config.sweepIntervalMs);

    // Never keeps the process alive on its own.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<SweepSummary> {
    const summary: SweepSummary = {
      expired: 0,
      tempFiles: 0,
      rowsDeleted: 0,
      failures: 0,
    };

    if (!this.config.enabled || !this.storage || this.running) return summary;

    this.running = true;

    try {
      await this.storage.ensureReady();

      const batch = this.config.sweepBatchSize;

      // 1. Unsent attachments past their time: expire the row, then the file.
      const claimed = await this.repository.claimExpired(batch, SWEEP_GRACE_MS);

      for (const row of claimed) {
        summary.expired += 1;

        try {
          await this.storage.remove(row.storageKey);
        } catch {
          summary.failures += 1;
        }
      }

      // 2. Interrupted uploads that left a temporary file behind.
      summary.tempFiles = await this.storage.sweepTemp(
        STALE_TEMP_MAX_AGE_MS,
        batch * 2,
      );

      // 3. Old EXPIRED rows: remove the file again (idempotent), and delete
      //    only the rows whose file is certainly gone.
      const old = await this.repository.findOldExpired(
        EXPIRED_ROW_RETENTION_MS,
        batch,
      );

      const removable: string[] = [];

      for (const row of old) {
        try {
          await this.storage.remove(row.storageKey);
          removable.push(row.id);
        } catch {
          summary.failures += 1;
        }
      }

      summary.rowsDeleted = await this.repository.deleteExpiredRows(removable);
    } catch (error) {
      summary.failures += 1;
      this.logger.warn(`Attachment sweep stopped (${errorName(error)})`);
    } finally {
      this.running = false;
    }

    if (summary.expired + summary.tempFiles + summary.rowsDeleted > 0) {
      this.logger.log(
        `Attachment sweep: expired=${summary.expired} temp=${summary.tempFiles} ` +
          `rows=${summary.rowsDeleted} failures=${summary.failures}`,
      );
    }

    return summary;
  }
}
