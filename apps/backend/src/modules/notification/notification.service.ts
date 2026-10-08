import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';

import { PaginationUtil } from '../../common/utils/pagination.util';

import {
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  NOTIFICATION_REPOSITORY,
  NOTIFICATION_TYPE_CHANNELS,
} from './constants/notification.constants';
import type {
  SubscribePushDto,
  UnsubscribePushDto,
} from './dto/push-subscription.dto';
import type { NotificationQueryDto } from './dto/notification-query.dto';
import type { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import type {
  NotificationEntity,
  NotificationParams,
  NotificationPreferencesEntity,
  PublishNotificationInput,
} from './entities/notification.entity';
import { buildDedupeKey, decideDeliveries } from './notification.policy';
import {
  buildNotificationPath,
  renderNotification,
  sanitizeText,
} from './notification.templates';
import type { NotificationWorker } from './notification.worker';
import {
  PushEndpointError,
  validatePushEndpoint,
  validatePushKeys,
} from './push-endpoint.validator';
import { WebPushService } from './web-push.service';
import type {
  INotificationRepository,
  NotificationRow,
} from './repository/notification.repository.interface';

/**
 * Late-bound worker reference. The worker is optional here: the service
 * only nudges it so a fresh notification is delivered within
 * milliseconds instead of waiting for the next poll tick. Delivery
 * correctness never depends on this call.
 */
export const NOTIFICATION_WORKER_KICK = Symbol('NOTIFICATION_WORKER_KICK');

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repository: INotificationRepository,
    private readonly configService: ConfigService,
    private readonly webPushService: WebPushService,
    @Optional()
    @Inject(NOTIFICATION_WORKER_KICK)
    private readonly worker?: Pick<NotificationWorker, 'kick'>,
  ) {}

  // ---------------------------------------------------------------------
  // Publishing (called by domain services AFTER their own write succeeded)
  // ---------------------------------------------------------------------

  /**
   * Never throws. A notification problem must never fail, roll back or
   * slow down the business operation that triggered it, so every error is
   * swallowed here (logged by code only, reported to Sentry with tags —
   * no PII, no entity titles).
   */
  async publish(input: PublishNotificationInput): Promise<void> {
    try {
      await this.doPublish(input);
    } catch (error) {
      this.logger.error(
        `Failed to publish notification type=${input.type} (${this.errorName(error)})`,
      );

      try {
        Sentry.captureException(error, {
          tags: { area: 'notification', stage: 'publish', type: input.type },
        });
      } catch {
        // Reporting must never throw either.
      }
    }
  }

  private async doPublish(input: PublishNotificationInput): Promise<void> {
    const recipientIds = Array.from(
      new Set(
        input.recipientIds.filter(
          (id): id is string =>
            typeof id === 'string' && id.length > 0 && id !== input.actorId,
        ),
      ),
    );

    if (recipientIds.length === 0) return;

    const recipients = await this.repository.findEligibleRecipients(
      input.companyId,
      recipientIds,
    );

    if (recipients.length === 0) return;

    const eligibleIds = recipients.map((recipient) => recipient.id);
    const channels = NOTIFICATION_TYPE_CHANNELS[input.type];

    const emailEnabledGlobally = this.isEmailEnabled();
    const pushAvailable = channels.push && this.webPushService.isConfigured();

    const [disabled, subscriptions] = await Promise.all([
      channels.email || channels.push
        ? this.repository.findDisabledChannels(input.companyId, eligibleIds)
        : Promise.resolve([]),
      pushAvailable
        ? this.repository.findPushSubscriptionTargets(
            input.companyId,
            eligibleIds,
          )
        : Promise.resolve([]),
    ]);

    const params: NotificationParams = {
      title: sanitizeText(input.title),
      ...(input.startAt && { startAt: input.startAt.toISOString() }),
    };

    const dedupeKey = buildDedupeKey(input.type, input.occurrenceId);

    let createdWithDeliveries = 0;

    // One recipient failing (e.g. a deleted user mid-flight) must not
    // starve the others.
    for (const recipient of recipients) {
      try {
        const deliveries = decideDeliveries({
          type: input.type,
          emailEnabledGlobally,
          pushAvailable,
          disabledChannels: new Set(
            disabled
              .filter((row) => row.userId === recipient.id)
              .map((row) => row.channel),
          ),
          pushSubscriptionIds: subscriptions
            .filter((row) => row.userId === recipient.id)
            .map((row) => row.id),
        });

        const created = await this.repository.createWithDeliveries({
          companyId: input.companyId,
          userId: recipient.id,
          actorId: input.actorId,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          params: params as Record<string, string>,
          dedupeKey,
          deliveries,
        });

        if (created && deliveries.length > 0) createdWithDeliveries += 1;
      } catch (error) {
        this.logger.error(
          `Failed to store notification type=${input.type} (${this.errorName(error)})`,
        );
      }
    }

    if (createdWithDeliveries > 0) this.worker?.kick();
  }

  // ---------------------------------------------------------------------
  // Inbox
  // ---------------------------------------------------------------------

  async findAll(
    companyId: string,
    userId: string,
    query: NotificationQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit;

    const [{ items, total }, language] = await Promise.all([
      this.repository.findManyForUser(companyId, userId, {
        skip: (page - 1) * limit,
        take: limit,
        unreadOnly: query.unreadOnly === true,
      }),
      this.repository.findUserLanguage(companyId, userId),
    ]);

    return {
      data: items.map((row) => this.toEntity(row, language)),
      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async getUnreadCount(
    companyId: string,
    userId: string,
  ): Promise<{ count: number }> {
    return { count: await this.repository.countUnread(companyId, userId) };
  }

  async markRead(
    companyId: string,
    userId: string,
    id: string,
  ): Promise<{ id: string; read: true }> {
    const found = await this.repository.markRead(companyId, userId, id);

    // Same 404 for "does not exist", "someone else's" and "another
    // tenant's".
    if (!found) throw new NotFoundException('Notification not found.');

    return { id, read: true };
  }

  async markAllRead(
    companyId: string,
    userId: string,
  ): Promise<{ updated: number }> {
    return { updated: await this.repository.markAllRead(companyId, userId) };
  }

  private toEntity(row: NotificationRow, language: string): NotificationEntity {
    const params = (row.params ?? {}) as NotificationParams;

    const actorName = row.actor
      ? `${row.actor.firstName} ${row.actor.lastName}`.trim()
      : '';

    const rendered = renderNotification(row.type, language, {
      actorName,
      title: params.title,
      startAt: params.startAt,
    });

    return {
      id: row.id,
      type: row.type,
      title: rendered.title,
      body: rendered.body,
      path: buildNotificationPath(row.entityType, row.entityId),
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.actor ? { id: row.actor.id, name: actorName } : null,
      params: params.startAt ? { startAt: params.startAt } : {},
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }

  // ---------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------

  async getPreferences(
    companyId: string,
    userId: string,
  ): Promise<NotificationPreferencesEntity> {
    const [preferences, devices] = await Promise.all([
      this.repository.getChannelPreferences(companyId, userId),
      this.repository.listPushSubscriptions(companyId, userId),
    ]);

    return {
      // No row = the application default (enabled).
      email: preferences.email ?? true,
      push: preferences.push ?? true,
      emailAvailable: this.isEmailEnabled(),
      pushAvailable: this.webPushService.isConfigured(),
      devices: devices.map((device) => ({
        id: device.id,
        label: device.userAgent,
        createdAt: device.createdAt,
        lastSuccessAt: device.lastSuccessAt,
      })),
    };
  }

  async updatePreference(
    companyId: string,
    userId: string,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferencesEntity> {
    await this.repository.upsertChannelPreference(
      companyId,
      userId,
      dto.channel,
      dto.enabled,
    );

    return this.getPreferences(companyId, userId);
  }

  // ---------------------------------------------------------------------
  // Web Push subscriptions
  // ---------------------------------------------------------------------

  getPushPublicKey(): { publicKey: string } {
    const publicKey = this.webPushService.getPublicKey();

    if (!publicKey) {
      throw new ServiceUnavailableException(
        'Push notifications are not available.',
      );
    }

    return { publicKey };
  }

  async subscribePush(
    companyId: string,
    userId: string,
    dto: SubscribePushDto,
  ): Promise<{ id: string }> {
    if (!this.webPushService.isConfigured()) {
      throw new ServiceUnavailableException(
        'Push notifications are not available.',
      );
    }

    try {
      validatePushEndpoint(dto.endpoint);
      validatePushKeys(dto.keys.p256dh, dto.keys.auth);
    } catch (error) {
      // Only the reason code is returned — never echo the endpoint back.
      const code = error instanceof PushEndpointError ? error.code : 'invalid';
      throw new BadRequestException(`Invalid push subscription (${code}).`);
    }

    const userAgent = dto.userAgent ? sanitizeText(dto.userAgent, 255) : null;

    return this.repository.upsertPushSubscription(
      {
        companyId,
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: userAgent || null,
      },
      MAX_PUSH_SUBSCRIPTIONS_PER_USER,
    );
  }

  /**
   * Always succeeds: whether the endpoint belonged to the caller, to
   * someone else, or did not exist is deliberately not observable.
   */
  async unsubscribePush(
    companyId: string,
    userId: string,
    dto: UnsubscribePushDto,
  ): Promise<{ unsubscribed: true }> {
    await this.repository.deletePushSubscriptionByEndpoint(
      companyId,
      userId,
      dto.endpoint,
    );

    return { unsubscribed: true };
  }

  // ---------------------------------------------------------------------

  private isEmailEnabled(): boolean {
    return (
      this.configService.get<string>('NOTIFICATIONS_EMAIL_ENABLED') === 'true'
    );
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : 'unknown';
  }
}
