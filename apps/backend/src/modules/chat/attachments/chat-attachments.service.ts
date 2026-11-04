import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { ChatEligibilityService } from '../chat-eligibility.service';
import type { ChatConversationRow } from '../chat.repository.interface';
import { ChatService } from '../chat.service';
import type { ChatActor, ChatAttachmentDto } from '../chat.types';
import { errorName } from '../chat.utils';

import {
  AttachmentRejectedError,
  inspectAttachment,
  type InspectionFailure,
} from './attachment-inspector';
import {
  AttachmentFileMissingError,
  AttachmentStorageUnavailableError,
  type AttachmentStorage,
  type OpenedAttachment,
} from './attachment-storage.interface';
import {
  sanitizeDisplayName,
  withExtensionFor,
} from './attachment-filename.util';
import type { StoredTempFile } from './attachment-upload.storage-engine';
import type { ChatAttachmentsConfig } from './chat-attachments.config';
import {
  ATTACHMENT_ERRORS,
  CHAT_ATTACHMENTS_CONFIG,
  CHAT_ATTACHMENTS_REPOSITORY,
  CHAT_ATTACHMENTS_STORAGE,
  COMPANY_ID_SEGMENT_PATTERN,
  IMAGE_CONTENT_TYPES,
  PDF_CONTENT_TYPE,
  SPREADSHEET_CONTENT_TYPES,
} from './chat-attachments.constants';
import { toAttachmentDto } from './chat-attachments-link.service';
import type {
  AttachmentRow,
  IChatAttachmentsRepository,
  ReserveAttachmentResult,
} from './chat-attachments.repository';

type EnabledConfig = Extract<ChatAttachmentsConfig, { enabled: true }>;

/** Uploads one caller may have in flight in this process at the same time. */
const MAX_IN_FLIGHT_PER_USER = 2;

/** Everything an accepted upload carries from the preflight to completion. */
export interface UploadPermit {
  actor: ChatActor;
  conversation: ChatConversationRow;
  tempPath: string;
  /** Ceiling of the bytes the engine will accept for this request. */
  maxBytes: number;
  release(): void;
}

export interface UploadedAttachmentResult {
  attachment: ChatAttachmentDto;
  /** When an unsent attachment stops being usable. */
  expiresAt: string;
}

export interface AttachmentClientConfig {
  enabled: boolean;
  imageMaxBytes?: number;
  pdfMaxBytes?: number;
  spreadsheetMaxBytes?: number;
  allowedContentTypes?: string[];
  readyTtlMs?: number;
}

export interface AttachmentDownload {
  row: AttachmentRow;
  opened: OpenedAttachment;
}

const FAILURE_TO_EXCEPTION: Record<InspectionFailure, () => HttpException> = {
  empty: () => new BadRequestException(ATTACHMENT_ERRORS.empty),
  unsupported_type: () =>
    new UnsupportedMediaTypeException(ATTACHMENT_ERRORS.unsupportedType),
  corrupt: () => new BadRequestException(ATTACHMENT_ERRORS.corrupt),
  too_large: () => new PayloadTooLargeException(ATTACHMENT_ERRORS.tooLarge),
  dimensions: () => new BadRequestException(ATTACHMENT_ERRORS.dimensions),
  pdf_encrypted: () => new BadRequestException(ATTACHMENT_ERRORS.pdfEncrypted),
  pdf_active_content: () =>
    new BadRequestException(ATTACHMENT_ERRORS.pdfActiveContent),
  type_mismatch: () => new BadRequestException(ATTACHMENT_ERRORS.typeMismatch),
  spreadsheet_macro: () =>
    new BadRequestException(ATTACHMENT_ERRORS.spreadsheetMacro),
  spreadsheet_encrypted: () =>
    new BadRequestException(ATTACHMENT_ERRORS.spreadsheetEncrypted),
  spreadsheet_active_content: () =>
    new BadRequestException(ATTACHMENT_ERRORS.spreadsheetActiveContent),
};

const RESERVE_FAILURE_TO_EXCEPTION: Record<
  Extract<ReserveAttachmentResult, { ok: false }>['reason'],
  () => HttpException
> = {
  pending_limit: () =>
    new HttpException(
      ATTACHMENT_ERRORS.quotaPending,
      HttpStatus.TOO_MANY_REQUESTS,
    ),
  daily_limit: () =>
    new HttpException(
      ATTACHMENT_ERRORS.quotaDaily,
      HttpStatus.TOO_MANY_REQUESTS,
    ),
  company_quota: () =>
    new HttpException(
      ATTACHMENT_ERRORS.quotaCompany,
      HttpStatus.INSUFFICIENT_STORAGE,
    ),
  global_quota: () =>
    new HttpException(
      ATTACHMENT_ERRORS.quotaGlobal,
      HttpStatus.INSUFFICIENT_STORAGE,
    ),
};

/**
 * Upload, download and cancel of chat attachments.
 *
 * Authorization is NOT implemented here. Every operation first resolves the
 * caller with ChatEligibilityService.requireActor and the conversation with
 * ChatService.authorize - the existing chat access path, unchanged and
 * called as is - and only then touches an attachment, always scoped to that
 * conversation AND the caller's company. A uniform 404 hides everything the
 * caller may not know about.
 */
@Injectable()
export class ChatAttachmentsService {
  private readonly logger = new Logger(ChatAttachmentsService.name);

  private inFlightTotal = 0;
  private readonly inFlightByUser = new Map<string, number>();

  constructor(
    @Inject(CHAT_ATTACHMENTS_CONFIG)
    private readonly config: ChatAttachmentsConfig,
    @Inject(CHAT_ATTACHMENTS_STORAGE)
    private readonly storage: AttachmentStorage | null,
    @Inject(CHAT_ATTACHMENTS_REPOSITORY)
    private readonly repository: IChatAttachmentsRepository,
    private readonly eligibility: ChatEligibilityService,
    private readonly chat: ChatService,
  ) {}

  // ---------------------------------------------------------------------
  // Client configuration
  // ---------------------------------------------------------------------

  async getClientConfig(userId: string): Promise<AttachmentClientConfig> {
    await this.eligibility.requireActor(userId);

    if (!this.config.enabled) return { enabled: false };

    return {
      enabled: true,
      imageMaxBytes: this.config.imageMaxBytes,
      pdfMaxBytes: this.config.pdfMaxBytes,
      spreadsheetMaxBytes: this.config.spreadsheetMaxBytes,
      allowedContentTypes: [
        ...IMAGE_CONTENT_TYPES,
        PDF_CONTENT_TYPE,
        ...SPREADSHEET_CONTENT_TYPES,
      ],
      readyTtlMs: this.config.readyTtlMs,
    };
  }

  // ---------------------------------------------------------------------
  // Upload
  // ---------------------------------------------------------------------

  /**
   * Runs BEFORE a single byte of the body is read: caller and conversation
   * are authorised, the cheap limits are checked and a concurrency slot is
   * taken. Only then may the body be streamed to a temporary file.
   */
  async preflightUpload(
    userId: string,
    conversationId: string,
  ): Promise<UploadPermit> {
    const { config, storage } = this.requireReady();

    const actor = await this.eligibility.requireActor(userId);
    const conversation = await this.chat.authorize(actor, conversationId);

    if (conversation.type !== 'DIRECT') {
      throw new BadRequestException(ATTACHMENT_ERRORS.directOnly);
    }

    // The company id becomes the first storage-key segment.
    if (!COMPANY_ID_SEGMENT_PATTERN.test(actor.companyId)) {
      throw new ServiceUnavailableException(
        ATTACHMENT_ERRORS.storageUnavailable,
      );
    }

    const release = this.acquireSlot(actor.userId, config);

    try {
      await storage.ensureReady();

      const maxBytes = Math.max(
        config.imageMaxBytes,
        config.pdfMaxBytes,
        config.spreadsheetMaxBytes,
      );

      const free = await storage.freeBytes();

      if (free < config.minFreeBytes + maxBytes) {
        throw new ServiceUnavailableException(
          ATTACHMENT_ERRORS.storageUnavailable,
        );
      }

      // Early, cheap refusals (the authoritative check is under a lock in
      // `reserve`): a user already at a limit is not given disk space.
      if (
        (await this.repository.countPendingForUser(
          actor.userId,
          actor.companyId,
        )) >= config.maxPendingPerUser
      ) {
        throw RESERVE_FAILURE_TO_EXCEPTION.pending_limit();
      }

      if (
        (await this.repository.countRecentForUser(
          actor.userId,
          actor.companyId,
        )) >= config.maxDailyPerUser
      ) {
        throw RESERVE_FAILURE_TO_EXCEPTION.daily_limit();
      }

      if (
        (await this.repository.usedBytes(actor.companyId)) >=
        config.companyQuotaBytes
      ) {
        throw RESERVE_FAILURE_TO_EXCEPTION.company_quota();
      }

      return {
        actor,
        conversation,
        tempPath: storage.createTempPath(),
        maxBytes,
        release,
      };
    } catch (error) {
      release();
      throw this.mapStorageError(error);
    }
  }

  /**
   * The body has been received into a temporary file. Validates it, reserves
   * its quota (row first), moves it to its final key and marks it READY. At
   * any failure the temporary and the final file are removed and the row is
   * expired, so nothing is left behind.
   */
  async completeUpload(
    permit: UploadPermit,
    file: Partial<StoredTempFile> & {
      originalname?: string;
      mimetype?: string;
    },
  ): Promise<UploadedAttachmentResult> {
    const { config, storage } = this.requireReady();
    const { actor, conversation } = permit;

    let committedKey: string | null = null;
    let rowId: string | null = null;

    try {
      if (!file || file.path !== permit.tempPath || !file.sha256) {
        throw new BadRequestException(ATTACHMENT_ERRORS.invalidUpload);
      }

      const inspection = await this.inspect(
        storage,
        config,
        permit.tempPath,
        file,
      );

      const token = randomUUID();
      const storageKey = `${actor.companyId}/${token.slice(0, 2)}/${token}`;

      const displayName = withExtensionFor(
        sanitizeDisplayName(file.originalname),
        inspection.contentType,
      );

      const reserved = await this.repository.reserve({
        companyId: actor.companyId,
        conversationId: conversation.id,
        uploaderKey: actor.userId,
        kind: inspection.kind,
        contentType: inspection.contentType,
        displayName,
        sizeBytes: file.size as number,
        sha256: file.sha256,
        width: inspection.width,
        height: inspection.height,
        storageKey,
        uploadingTtlMs: config.uploadingTtlMs,
        maxPendingPerUser: config.maxPendingPerUser,
        maxDailyPerUser: config.maxDailyPerUser,
        companyQuotaBytes: config.companyQuotaBytes,
        globalQuotaBytes: config.globalQuotaBytes,
      });

      if (!reserved.ok) throw RESERVE_FAILURE_TO_EXCEPTION[reserved.reason]();

      rowId = reserved.row.id;

      await storage.commit(permit.tempPath, storageKey);
      committedKey = storageKey;

      const ready = await this.repository.markReady(
        rowId,
        actor.companyId,
        config.readyTtlMs,
      );

      if (!ready) {
        // The sweeper expired the row while it was being finished.
        throw new ConflictException(ATTACHMENT_ERRORS.expired);
      }

      committedKey = null;

      return {
        attachment: toAttachmentDto(ready),
        expiresAt: (ready.expiresAt ?? new Date()).toISOString(),
      };
    } catch (error) {
      await this.rollbackUpload(storage, rowId, actor.companyId, committedKey);

      throw this.mapStorageError(error);
    } finally {
      await storage.discardTemp(permit.tempPath).catch(() => undefined);
    }
  }

  private async inspect(
    storage: AttachmentStorage,
    config: EnabledConfig,
    tempPath: string,
    file: Partial<StoredTempFile> & {
      originalname?: string;
      mimetype?: string;
    },
  ) {
    const opened = await storage.openTempReader(tempPath);

    try {
      if (file.size !== opened.reader.size) {
        throw new BadRequestException(ATTACHMENT_ERRORS.invalidUpload);
      }

      return await inspectAttachment(
        opened.reader,
        {
          imageMaxBytes: config.imageMaxBytes,
          pdfMaxBytes: config.pdfMaxBytes,
          spreadsheetMaxBytes: config.spreadsheetMaxBytes,
          maxImageDimension: config.maxImageDimension,
          maxImagePixels: config.maxImagePixels,
        },
        // What the client claimed: cross-checked for spreadsheets only, never
        // used to decide the type (the bytes do).
        { originalName: file.originalname, declaredMimeType: file.mimetype },
      );
    } catch (error) {
      if (error instanceof AttachmentRejectedError) {
        throw FAILURE_TO_EXCEPTION[error.failure]();
      }

      throw error;
    } finally {
      await opened.close().catch(() => undefined);
    }
  }

  private async rollbackUpload(
    storage: AttachmentStorage,
    rowId: string | null,
    companyId: string,
    committedKey: string | null,
  ): Promise<void> {
    if (rowId) {
      await this.repository
        .expireAny(rowId, companyId)
        .catch((error: unknown) =>
          this.logger.warn(
            `Could not expire an attachment (${errorName(error)})`,
          ),
        );
    }

    if (committedKey) {
      await storage.remove(committedKey).catch((error: unknown) =>
        // The row is EXPIRED; the sweeper removes the file again later.
        this.logger.warn(`Could not remove a file (${errorName(error)})`),
      );
    }
  }

  // ---------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------

  /**
   * Access = the existing chat access to the conversation, then the
   * attachment must be linked to a message of THAT conversation and company.
   * There is no URL, token or path that works outside this check.
   */
  async download(
    userId: string,
    conversationId: string,
    attachmentId: string,
  ): Promise<AttachmentDownload> {
    const { storage } = this.requireReady();

    const actor = await this.eligibility.requireActor(userId);
    const conversation = await this.chat.authorize(actor, conversationId);

    const row = await this.repository.findInConversation(
      attachmentId,
      conversation.id,
      actor.companyId,
    );

    if (!row || row.status !== 'ATTACHED') {
      throw new NotFoundException(ATTACHMENT_ERRORS.notFound);
    }

    let opened: OpenedAttachment;

    try {
      opened = await storage.open(row.storageKey);
    } catch (error) {
      this.logger.error(
        `Attachment ${row.id} could not be opened (${errorName(error)})`,
      );
      throw new ServiceUnavailableException(ATTACHMENT_ERRORS.fileUnavailable);
    }

    // The stored size is the integrity check that is cheap enough for every
    // download (the SHA-256 is kept for an offline reconciliation job).
    if (opened.size !== row.sizeBytes) {
      opened.stream.destroy();
      this.logger.error(`Attachment ${row.id} does not match its stored size`);
      throw new ServiceUnavailableException(ATTACHMENT_ERRORS.fileUnavailable);
    }

    return { row, opened };
  }

  // ---------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------

  /**
   * The uploader discards an attachment that was not sent. A sent
   * (ATTACHED) attachment can never be cancelled or deleted here.
   */
  async cancel(
    userId: string,
    conversationId: string,
    attachmentId: string,
  ): Promise<{ cancelled: true }> {
    const { storage } = this.requireReady();

    const actor = await this.eligibility.requireActor(userId);
    const conversation = await this.chat.authorize(actor, conversationId);

    const row = await this.repository.findInConversation(
      attachmentId,
      conversation.id,
      actor.companyId,
    );

    if (!row) throw new NotFoundException(ATTACHMENT_ERRORS.notFound);

    const expired = await this.repository.expireOwned(
      row.id,
      actor.userId,
      actor.companyId,
    );

    if (!expired) throw new NotFoundException(ATTACHMENT_ERRORS.notFound);

    await storage
      .remove(expired.storageKey)
      .catch((error: unknown) =>
        this.logger.warn(`Could not remove a file (${errorName(error)})`),
      );

    return { cancelled: true };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private requireReady(): {
    config: EnabledConfig;
    storage: AttachmentStorage;
  } {
    if (!this.config.enabled || !this.storage) {
      throw new NotFoundException(ATTACHMENT_ERRORS.disabled);
    }

    return { config: this.config, storage: this.storage };
  }

  /** Bounds the uploads being received at once (RAM, disk and CPU). */
  private acquireSlot(userId: string, config: EnabledConfig): () => void {
    const mine = this.inFlightByUser.get(userId) ?? 0;

    if (
      this.inFlightTotal >= config.maxConcurrentUploads ||
      mine >= MAX_IN_FLIGHT_PER_USER
    ) {
      throw new HttpException(
        ATTACHMENT_ERRORS.busy,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.inFlightTotal += 1;
    this.inFlightByUser.set(userId, mine + 1);

    let released = false;

    return () => {
      if (released) return;
      released = true;

      this.inFlightTotal -= 1;

      const left = (this.inFlightByUser.get(userId) ?? 1) - 1;

      if (left <= 0) this.inFlightByUser.delete(userId);
      else this.inFlightByUser.set(userId, left);
    };
  }

  private mapStorageError(error: unknown): unknown {
    if (
      error instanceof AttachmentStorageUnavailableError ||
      error instanceof AttachmentFileMissingError
    ) {
      return new ServiceUnavailableException(
        ATTACHMENT_ERRORS.storageUnavailable,
      );
    }

    return error;
  }
}
