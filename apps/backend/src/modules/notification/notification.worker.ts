import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';

import { MailService } from '../mail/mail.service';

import {
  CLEANUP_BATCH_SIZE,
  CLEANUP_INTERVAL_MS,
  CLEANUP_MAX_BATCHES,
  DELIVERY_LOCK_TIMEOUT_MS,
  EMAIL_RATE_LIMIT_PER_HOUR,
  NOTIFICATION_REPOSITORY,
  NOTIFICATION_RETENTION_DAYS,
  PUSH_MAX_FAILURE_COUNT,
  WORKER_CLAIM_BATCH_SIZE,
  WORKER_CONCURRENCY,
  WORKER_MAX_BATCHES_PER_TICK,
  WORKER_TICK_MS,
} from './constants/notification.constants';
import type { NotificationParams } from './entities/notification.entity';
import {
  isDeliveryExpired,
  maxAttemptsFor,
  nextRetryDelayMs,
} from './notification.policy';
import {
  buildNotificationPath,
  renderNotificationEmail,
  renderPushPayload,
  type RenderContext,
} from './notification.templates';
import { PushSendError, WebPushService } from './web-push.service';
import type {
  ClaimedDelivery,
  DeliveryContext,
  INotificationRepository,
} from './repository/notification.repository.interface';

const RATE_LIMIT_DEFER_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Delivery worker — CURRENT IMPLEMENTATION, not the permanent
 * architecture.
 *
 * It runs inside the Nest process and uses PostgreSQL as the queue:
 * NotificationDelivery is the source of truth, rows are claimed with
 * `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`.
 *
 * Guarantees
 *   - At-least-once delivery. A crash after sending but before marking
 *     `sent` can duplicate ONE message; a crash before sending cannot lose
 *     it (the row is reclaimed once `lockedAt` is older than
 *     DELIVERY_LOCK_TIMEOUT_MS).
 *   - A delivery is held by at most one claimer at a time (SKIP LOCKED),
 *     and a late/zombie worker cannot overwrite the outcome of the claim
 *     that replaced it (final-state updates are conditional on the
 *     claim's attempt number).
 *   - `attempts` counts claims, so a poison row cannot loop forever.
 *
 * Migration path (documented, not built): (1) run this exact class in a
 * dedicated PM2 process by setting NOTIFICATIONS_WORKER_ENABLED=false on
 * the API process(es) and true on one worker process; (2) later replace
 * ONLY the claim step with BullMQ jobs — the delivery table, templates,
 * policy and send functions stay as they are.
 */
@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);

  private tickTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private running = false;
  private rerun = false;
  private stopped = false;

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repository: INotificationRepository,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly webPushService: WebPushService,
  ) {}

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  /**
   * On by default; OFF under NODE_ENV=test (so importing AppModule in a
   * test never starts a background loop) unless explicitly enabled.
   * NOTIFICATIONS_WORKER_ENABLED=false turns it off on API-only instances.
   */
  isEnabled(): boolean {
    const flag = this.configService.get<string>('NOTIFICATIONS_WORKER_ENABLED');
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return this.configService.get<string>('NODE_ENV') !== 'test';
  }

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log('Notification worker is disabled.');
      return;
    }

    this.tickTimer = setInterval(() => void this.tick(), WORKER_TICK_MS);
    this.tickTimer.unref();

    this.cleanupTimer = setInterval(
      () => void this.cleanup(),
      CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref();

    // Pick up anything left pending/stuck by a previous process soon after
    // boot, without delaying startup.
    setTimeout(() => void this.tick(), 5_000).unref();

    this.logger.log('Notification worker started.');
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /** Nudge: process new deliveries now instead of at the next poll. */
  kick(): void {
    if (!this.isEnabled() || this.stopped) return;
    setImmediate(() => void this.tick());
  }

  // ---------------------------------------------------------------------
  // Tick / batch
  // ---------------------------------------------------------------------

  /** Drains due deliveries. Re-entrancy safe. Returns how many it handled. */
  async tick(now: () => Date = () => new Date()): Promise<number> {
    if (this.running) {
      // A kick arrived mid-run: do one more pass right after.
      this.rerun = true;
      return 0;
    }

    this.running = true;
    let processed = 0;

    try {
      do {
        this.rerun = false;

        for (let i = 0; i < WORKER_MAX_BATCHES_PER_TICK; i += 1) {
          const handled = await this.processBatch(now());
          processed += handled;
          if (handled < WORKER_CLAIM_BATCH_SIZE) break;
        }
      } while (this.rerun && !this.stopped);
    } catch (error) {
      this.logger.error(`Worker tick failed (${this.errorName(error)})`);
      this.report(error, 'tick');
    } finally {
      this.running = false;
    }

    return processed;
  }

  /** Claims one batch and processes it with bounded concurrency. */
  async processBatch(now: Date): Promise<number> {
    const claimed = await this.repository.claimDeliveries(
      now,
      new Date(now.getTime() - DELIVERY_LOCK_TIMEOUT_MS),
      WORKER_CLAIM_BATCH_SIZE,
    );

    for (let i = 0; i < claimed.length; i += WORKER_CONCURRENCY) {
      await Promise.all(
        claimed
          .slice(i, i + WORKER_CONCURRENCY)
          .map((delivery) => this.processDelivery(delivery, now)),
      );
    }

    return claimed.length;
  }

  // ---------------------------------------------------------------------
  // One delivery
  // ---------------------------------------------------------------------

  async processDelivery(claimed: ClaimedDelivery, now: Date): Promise<void> {
    try {
      const context = await this.repository.loadDeliveryContext(claimed.id);

      // Notification (and its deliveries) cleaned up / user deleted.
      if (!context) return;

      await this.dispatch(claimed, context, now);
    } catch (error) {
      // Unexpected (bug / DB). Treated as a retryable failure; the code is
      // generic so nothing sensitive can leak into the row.
      this.logger.error(
        `Delivery ${claimed.id} channel=${claimed.channel} failed unexpectedly (${this.errorName(error)})`,
      );
      this.report(error, 'dispatch', claimed.channel);

      await this.safely(() => this.fail(claimed, 'internal_error', now));
    }
  }

  private async dispatch(
    claimed: ClaimedDelivery,
    context: DeliveryContext,
    now: Date,
  ): Promise<void> {
    const { notification, recipient } = context;
    const { id, attempts, channel } = claimed;

    if (attempts > maxAttemptsFor(channel)) {
      await this.repository.markDeliveryFailed(
        id,
        attempts,
        'attempts_exhausted',
      );
      return;
    }

    if (isDeliveryExpired(notification.createdAt, now)) {
      await this.repository.markDeliverySkipped(id, attempts, 'expired');
      return;
    }

    // Tenant / ownership guard: the recipient must still be an active user
    // of the SAME company the notification was created for.
    if (
      !recipient.isActive ||
      recipient.deletedAt !== null ||
      recipient.id !== notification.userId ||
      recipient.companyId !== notification.companyId
    ) {
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'recipient_ineligible',
      );
      return;
    }

    if (channel === 'email') {
      await this.deliverEmail(claimed, context, now);
    } else if (channel === 'push') {
      await this.deliverPush(claimed, context, now);
    } else {
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'unknown_channel',
      );
    }
  }

  // --- Email -----------------------------------------------------------

  private async deliverEmail(
    claimed: ClaimedDelivery,
    context: DeliveryContext,
    now: Date,
  ): Promise<void> {
    const { id, attempts } = claimed;
    const { notification, recipient } = context;

    if (
      this.configService.get<string>('NOTIFICATIONS_EMAIL_ENABLED') !== 'true'
    ) {
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'channel_disabled',
      );
      return;
    }

    // Preference is re-read at send time: opting out after the
    // notification was queued is honoured.
    const preferences = await this.repository.getChannelPreferences(
      notification.companyId,
      notification.userId,
    );

    if (preferences.email === false) {
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'preference_disabled',
      );
      return;
    }

    const sentLastHour = await this.repository.countEmailsSentSince(
      notification.userId,
      new Date(now.getTime() - HOUR_MS),
    );

    if (sentLastHour >= EMAIL_RATE_LIMIT_PER_HOUR) {
      // Not a failure and not a consumed attempt — just later. The 24h
      // expiry above bounds how long it can keep deferring.
      await this.repository.deferDelivery(
        id,
        attempts,
        new Date(now.getTime() + RATE_LIMIT_DEFER_MS),
        'rate_limited',
      );
      return;
    }

    const rendered = renderNotificationEmail(
      notification.type,
      recipient.language,
      this.renderContext(notification),
      this.buildLink(notification),
    );

    try {
      await this.mailService.sendNotificationEmail(recipient.email, rendered);
    } catch (error) {
      await this.fail(claimed, this.emailErrorCode(error), now);
      return;
    }

    await this.repository.markDeliverySent(id, attempts, now);
  }

  // --- Push ------------------------------------------------------------

  private async deliverPush(
    claimed: ClaimedDelivery,
    context: DeliveryContext,
    now: Date,
  ): Promise<void> {
    const { id, attempts, target } = claimed;
    const { notification, recipient } = context;

    if (!this.webPushService.isConfigured()) {
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'channel_disabled',
      );
      return;
    }

    const preferences = await this.repository.getChannelPreferences(
      notification.companyId,
      notification.userId,
    );

    if (preferences.push === false) {
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'preference_disabled',
      );
      return;
    }

    const subscription =
      await this.repository.findPushSubscriptionForSend(target);

    if (!subscription) {
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'subscription_gone',
      );
      return;
    }

    // Ownership is re-checked NOW, not trusted from when the delivery was
    // created: the device may have been re-registered to another user
    // (or tenant) since.
    if (
      subscription.userId !== notification.userId ||
      subscription.companyId !== notification.companyId
    ) {
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'subscription_reassigned',
      );
      return;
    }

    // A logged-out user's device must stop receiving pushes.
    if (!(await this.repository.hasActiveSession(notification.userId, now))) {
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'no_active_session',
      );
      return;
    }

    if (!subscription.p256dh || !subscription.auth) {
      await this.repository.deletePushSubscriptionById(subscription.id);
      await this.repository.markDeliverySkipped(
        id,
        attempts,
        'subscription_invalid',
      );
      return;
    }

    const payload = renderPushPayload(
      notification.type,
      recipient.language,
      this.renderContext(notification),
      buildNotificationPath(notification.entityType, notification.entityId),
      notification.id,
    );

    try {
      await this.webPushService.send(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        payload,
      );
    } catch (error) {
      const code =
        error instanceof PushSendError ? error.code : 'network_error';

      if (error instanceof PushSendError && error.permanent) {
        // 404/410 or a structurally invalid subscription: it will never
        // work again.
        await this.repository.deletePushSubscriptionById(subscription.id);
        await this.repository.markDeliverySkipped(id, attempts, code);
        return;
      }

      await this.repository.recordPushFailure(
        subscription.id,
        now,
        PUSH_MAX_FAILURE_COUNT,
      );
      await this.fail(claimed, code, now);
      return;
    }

    await this.repository.recordPushSuccess(subscription.id, now);
    await this.repository.markDeliverySent(id, attempts, now);
  }

  // ---------------------------------------------------------------------
  // Failure handling
  // ---------------------------------------------------------------------

  /** Temporary failure -> back to pending with backoff; out of attempts -> failed. */
  private async fail(
    claimed: ClaimedDelivery,
    code: string,
    now: Date,
  ): Promise<void> {
    const delay = nextRetryDelayMs(claimed.channel, claimed.attempts);

    if (delay === null) {
      await this.repository.markDeliveryFailed(
        claimed.id,
        claimed.attempts,
        code,
      );
      return;
    }

    await this.repository.scheduleDeliveryRetry(
      claimed.id,
      claimed.attempts,
      new Date(now.getTime() + delay),
      code,
    );
  }

  private emailErrorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    const prefix = 'notification_delivery_failed:email:';

    return message.startsWith(prefix)
      ? message.slice(prefix.length).slice(0, 40)
      : 'smtp_error';
  }

  // ---------------------------------------------------------------------
  // Cleanup / retention
  // ---------------------------------------------------------------------

  /** Deletes notifications (and, by cascade, deliveries) past retention. */
  async cleanup(now: Date = new Date()): Promise<number> {
    const before = new Date(
      now.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS,
    );
    let total = 0;

    try {
      for (let i = 0; i < CLEANUP_MAX_BATCHES; i += 1) {
        const deleted = await this.repository.deleteNotificationsOlderThan(
          before,
          CLEANUP_BATCH_SIZE,
        );
        total += deleted;
        if (deleted < CLEANUP_BATCH_SIZE) break;
      }
    } catch (error) {
      this.logger.error(
        `Notification cleanup failed (${this.errorName(error)})`,
      );
      this.report(error, 'cleanup');
    }

    return total;
  }

  // ---------------------------------------------------------------------

  private renderContext(
    notification: DeliveryContext['notification'],
  ): RenderContext {
    const params = (notification.params ?? {}) as NotificationParams;

    return {
      actorName: notification.actor
        ? `${notification.actor.firstName} ${notification.actor.lastName}`.trim()
        : '',
      title: params.title,
      startAt: params.startAt,
    };
  }

  private buildLink(
    notification: DeliveryContext['notification'],
  ): string | null {
    const path = buildNotificationPath(
      notification.entityType,
      notification.entityId,
    );
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    if (!path || !frontendUrl) return null;

    return `${frontendUrl.replace(/\/+$/, '')}${path}`;
  }

  private async safely(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch {
      // The row stays `processing` and is reclaimed after the lock timeout.
    }
  }

  private report(error: unknown, stage: string, channel?: string): void {
    try {
      Sentry.captureException(error, {
        tags: { area: 'notification', stage, ...(channel && { channel }) },
      });
    } catch {
      // never throw from reporting
    }
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : 'unknown';
  }
}
