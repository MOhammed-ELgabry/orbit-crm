import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  ALL_NOTIFICATION_TYPES,
  type NotificationPreferenceChannel,
} from '../constants/notification.constants';

import type {
  ClaimedDelivery,
  CreateNotificationInput,
  DeliveryContext,
  DisabledChannel,
  EligibleRecipient,
  INotificationRepository,
  NotificationRow,
  PushSubscriptionRow,
  PushSubscriptionSendRow,
  PushSubscriptionTarget,
  UpsertPushSubscriptionInput,
} from './notification.repository.interface';

const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}

@Injectable()
export class NotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Inbox (always scoped by companyId AND userId)
  // ---------------------------------------------------------------------

  async findManyForUser(
    companyId: string,
    userId: string,
    options: { skip: number; take: number; unreadOnly: boolean },
  ): Promise<{ items: NotificationRow[]; total: number }> {
    const where: Prisma.NotificationWhereInput = {
      companyId,
      userId,
      ...(options.unreadOnly && { readAt: null }),
    };

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: options.skip,
        take: options.take,
        select: {
          id: true,
          type: true,
          entityType: true,
          entityId: true,
          params: true,
          readAt: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items, total };
  }

  countUnread(companyId: string, userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { companyId, userId, readAt: null },
    });
  }

  async markRead(
    companyId: string,
    userId: string,
    id: string,
  ): Promise<boolean> {
    // Existence check is part of the same tenant+owner filter, so another
    // user's / tenant's id is indistinguishable from a missing one.
    const exists = await this.prisma.notification.count({
      where: { id, companyId, userId },
    });

    if (exists === 0) return false;

    // Only flips unread -> read; an already-read row keeps its original
    // readAt (idempotent).
    await this.prisma.notification.updateMany({
      where: { id, companyId, userId, readAt: null },
      data: { readAt: new Date() },
    });

    return true;
  }

  async markAllRead(companyId: string, userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { companyId, userId, readAt: null },
      data: { readAt: new Date() },
    });

    return result.count;
  }

  async findUserLanguage(companyId: string, userId: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { language: true },
    });

    return user?.language ?? 'en';
  }

  // ---------------------------------------------------------------------
  // Publishing
  // ---------------------------------------------------------------------

  findEligibleRecipients(
    companyId: string,
    userIds: string[],
  ): Promise<EligibleRecipient[]> {
    if (userIds.length === 0) return Promise.resolve([]);

    return this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        companyId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, language: true },
    });
  }

  async findDisabledChannels(
    companyId: string,
    userIds: string[],
  ): Promise<DisabledChannel[]> {
    if (userIds.length === 0) return [];

    return this.prisma.notificationPreference.findMany({
      where: {
        companyId,
        userId: { in: userIds },
        type: ALL_NOTIFICATION_TYPES,
        enabled: false,
      },
      select: { userId: true, channel: true },
    });
  }

  findPushSubscriptionTargets(
    companyId: string,
    userIds: string[],
  ): Promise<PushSubscriptionTarget[]> {
    if (userIds.length === 0) return Promise.resolve([]);

    return this.prisma.pushSubscription.findMany({
      where: { companyId, userId: { in: userIds } },
      select: { id: true, userId: true },
    });
  }

  async createWithDeliveries(
    input: CreateNotificationInput,
  ): Promise<{ id: string } | null> {
    try {
      // Nested create: Notification + all its deliveries are one atomic
      // write.
      const created = await this.prisma.notification.create({
        data: {
          companyId: input.companyId,
          userId: input.userId,
          actorId: input.actorId,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          params: input.params,
          dedupeKey: input.dedupeKey,
          deliveries: {
            create: input.deliveries.map((delivery) => ({
              channel: delivery.channel,
              target: delivery.target,
            })),
          },
        },
        select: { id: true },
      });

      return created;
    } catch (error) {
      // @@unique([userId, dedupeKey]): this occurrence was already
      // published for this user — a duplicate, not a failure.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  // ---------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------

  async getChannelPreferences(
    companyId: string,
    userId: string,
  ): Promise<Partial<Record<NotificationPreferenceChannel, boolean>>> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { companyId, userId, type: ALL_NOTIFICATION_TYPES },
      select: { channel: true, enabled: true },
    });

    const result: Partial<Record<NotificationPreferenceChannel, boolean>> = {};

    for (const row of rows) {
      if (row.channel === 'email' || row.channel === 'push') {
        result[row.channel] = row.enabled;
      }
    }

    return result;
  }

  async upsertChannelPreference(
    companyId: string,
    userId: string,
    channel: NotificationPreferenceChannel,
    enabled: boolean,
  ): Promise<void> {
    const run = () =>
      this.prisma.notificationPreference.upsert({
        where: {
          companyId_userId_channel_type: {
            companyId,
            userId,
            channel,
            type: ALL_NOTIFICATION_TYPES,
          },
        },
        create: {
          companyId,
          userId,
          channel,
          type: ALL_NOTIFICATION_TYPES,
          enabled,
        },
        update: { enabled },
        select: { id: true },
      });

    try {
      await run();
    } catch (error) {
      // Two concurrent first-time upserts can both try to INSERT.
      if (isUniqueViolation(error)) {
        await run();
        return;
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------
  // Push subscriptions
  // ---------------------------------------------------------------------

  listPushSubscriptions(
    companyId: string,
    userId: string,
  ): Promise<PushSubscriptionRow[]> {
    // Secrets (endpoint, p256dh, auth) are deliberately not selected.
    return this.prisma.pushSubscription.findMany({
      where: { companyId, userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        userAgent: true,
        createdAt: true,
        lastSuccessAt: true,
      },
    });
  }

  async upsertPushSubscription(
    input: UpsertPushSubscriptionInput,
    maxPerUser: number,
  ): Promise<{ id: string }> {
    const run = () =>
      this.prisma.$transaction(async (tx) => {
        // Serialises concurrent subscribes of the SAME user so the
        // per-user cap cannot be exceeded by racing requests.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`push-sub:${input.userId}`}))`;

        const existing = await tx.pushSubscription.findUnique({
          where: { endpoint: input.endpoint },
          select: { userId: true },
        });

        // endpoint @unique is the single ownership guarantee: the row is
        // re-pointed at the new owner (and tenant) atomically.
        const subscription = await tx.pushSubscription.upsert({
          where: { endpoint: input.endpoint },
          create: {
            companyId: input.companyId,
            userId: input.userId,
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
            userAgent: input.userAgent,
          },
          update: {
            companyId: input.companyId,
            userId: input.userId,
            p256dh: input.p256dh,
            auth: input.auth,
            userAgent: input.userAgent,
            failureCount: 0,
            lastFailureAt: null,
          },
          select: { id: true },
        });

        if (existing && existing.userId !== input.userId) {
          // Pushes queued for the PREVIOUS owner must never reach the new
          // owner of this device.
          await tx.notificationDelivery.updateMany({
            where: {
              channel: 'push',
              target: subscription.id,
              status: { in: ['pending', 'processing'] },
              notification: { userId: { not: input.userId } },
            },
            data: {
              status: 'skipped',
              lastErrorCode: 'subscription_reassigned',
            },
          });
        }

        // Cap: keep the newest `maxPerUser`; the one just written is the
        // newest by definition so it is never evicted.
        const mine = await tx.pushSubscription.findMany({
          where: { companyId: input.companyId, userId: input.userId },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        });

        const overflow = mine
          .filter((row) => row.id !== subscription.id)
          .slice(maxPerUser - 1)
          .map((row) => row.id);

        if (overflow.length > 0) {
          await tx.pushSubscription.deleteMany({
            where: {
              id: { in: overflow },
              companyId: input.companyId,
              userId: input.userId,
            },
          });
        }

        return subscription;
      });

    try {
      return await run();
    } catch (error) {
      // Two users racing to register the same brand-new endpoint: one
      // INSERT loses; retry once, which then takes the update path.
      if (isUniqueViolation(error)) return run();
      throw error;
    }
  }

  async deletePushSubscriptionByEndpoint(
    companyId: string,
    userId: string,
    endpoint: string,
  ): Promise<number> {
    // Ownership AND tenant are part of the predicate: a user can only
    // ever remove a subscription that is currently theirs.
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId, companyId },
    });

    return result.count;
  }

  // ---------------------------------------------------------------------
  // Worker
  // ---------------------------------------------------------------------

  async claimDeliveries(
    now: Date,
    staleBefore: Date,
    limit: number,
  ): Promise<ClaimedDelivery[]> {
    // Atomic claim. The MATERIALIZED CTE (SELECT ... LIMIT ... FOR UPDATE
    // SKIP LOCKED) is evaluated exactly once — an `id IN (subquery)` form
    // can be re-planned as a nested loop that locks MORE than LIMIT rows.
    // SKIP LOCKED makes
    // concurrent workers (other Nest instances, other ticks) skip rows
    // another transaction is already claiming, so a row is handed to at
    // most one claimer at a time. `attempts` is incremented AT CLAIM, so
    // a crash after claiming still counts as an attempt and a poison row
    // cannot be retried forever. Stale `processing` rows (worker died)
    // are reclaimed by the second OR branch.
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        notificationId: string;
        channel: string;
        target: string;
        attempts: number;
      }>
    >(Prisma.sql`
      WITH picked AS MATERIALIZED (
        SELECT c."id"
        FROM "NotificationDelivery" AS c
        WHERE (c."status" = 'pending' AND c."nextAttemptAt" <= ${now})
           OR (c."status" = 'processing' AND c."lockedAt" < ${staleBefore})
        ORDER BY c."nextAttemptAt" ASC, c."id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "NotificationDelivery" AS d
      SET "status" = 'processing',
          "lockedAt" = ${now},
          "attempts" = d."attempts" + 1,
          "updatedAt" = ${now}
      FROM picked
      WHERE d."id" = picked."id"
      RETURNING d."id", d."notificationId", d."channel", d."target", d."attempts"
    `);

    return rows.map((row) => ({
      id: row.id,
      notificationId: row.notificationId,
      channel: row.channel,
      target: row.target,
      attempts: Number(row.attempts),
    }));
  }

  async loadDeliveryContext(
    deliveryId: string,
  ): Promise<DeliveryContext | null> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        channel: true,
        target: true,
        attempts: true,
        notification: {
          select: {
            id: true,
            companyId: true,
            userId: true,
            type: true,
            entityType: true,
            entityId: true,
            params: true,
            createdAt: true,
            actor: { select: { firstName: true, lastName: true } },
            user: {
              select: {
                id: true,
                email: true,
                language: true,
                companyId: true,
                isActive: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });

    if (!delivery) return null;

    const { user, ...notification } = delivery.notification;

    return {
      delivery: {
        id: delivery.id,
        channel: delivery.channel,
        target: delivery.target,
        attempts: delivery.attempts,
      },
      notification,
      recipient: user,
    };
  }

  findPushSubscriptionForSend(
    id: string,
  ): Promise<PushSubscriptionSendRow | null> {
    return this.prisma.pushSubscription.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });
  }

  async hasActiveSession(userId: string, now: Date): Promise<boolean> {
    const count = await this.prisma.authSession.count({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
    });

    return count > 0;
  }

  countEmailsSentSince(userId: string, since: Date): Promise<number> {
    return this.prisma.notificationDelivery.count({
      where: {
        channel: 'email',
        status: 'sent',
        sentAt: { gte: since },
        notification: { userId },
      },
    });
  }

  // Final-state transitions are conditional on (status = processing AND
  // attempts = the claim's attempt number). A worker that was presumed
  // dead, got its row reclaimed (attempts + 1) and then wakes up cannot
  // overwrite the newer claimer's outcome.

  private async finalize(
    id: string,
    attempts: number,
    data: Prisma.NotificationDeliveryUpdateManyMutationInput,
  ): Promise<boolean> {
    const result = await this.prisma.notificationDelivery.updateMany({
      where: { id, status: 'processing', attempts },
      data: { lockedAt: null, ...data },
    });

    return result.count === 1;
  }

  markDeliverySent(id: string, attempts: number, now: Date): Promise<boolean> {
    return this.finalize(id, attempts, {
      status: 'sent',
      sentAt: now,
      lastErrorCode: null,
    });
  }

  markDeliverySkipped(
    id: string,
    attempts: number,
    code: string,
  ): Promise<boolean> {
    return this.finalize(id, attempts, {
      status: 'skipped',
      lastErrorCode: code,
    });
  }

  markDeliveryFailed(
    id: string,
    attempts: number,
    code: string,
  ): Promise<boolean> {
    return this.finalize(id, attempts, {
      status: 'failed',
      lastErrorCode: code,
    });
  }

  scheduleDeliveryRetry(
    id: string,
    attempts: number,
    nextAttemptAt: Date,
    code: string,
  ): Promise<boolean> {
    return this.finalize(id, attempts, {
      status: 'pending',
      nextAttemptAt,
      lastErrorCode: code,
    });
  }

  deferDelivery(
    id: string,
    attempts: number,
    nextAttemptAt: Date,
    code: string,
  ): Promise<boolean> {
    return this.finalize(id, attempts, {
      status: 'pending',
      nextAttemptAt,
      lastErrorCode: code,
      attempts: Math.max(0, attempts - 1),
    });
  }

  async recordPushSuccess(id: string, now: Date): Promise<void> {
    await this.prisma.pushSubscription.updateMany({
      where: { id },
      data: { failureCount: 0, lastSuccessAt: now },
    });
  }

  async recordPushFailure(
    id: string,
    now: Date,
    maxFailures: number,
  ): Promise<void> {
    await this.prisma.pushSubscription.updateMany({
      where: { id },
      data: { failureCount: { increment: 1 }, lastFailureAt: now },
    });

    await this.prisma.pushSubscription.deleteMany({
      where: { id, failureCount: { gte: maxFailures } },
    });
  }

  async deletePushSubscriptionById(id: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { id } });
  }

  // ---------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------

  async deleteNotificationsOlderThan(
    before: Date,
    batchSize: number,
  ): Promise<number> {
    const old = await this.prisma.notification.findMany({
      where: { createdAt: { lt: before } },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
      select: { id: true },
    });

    if (old.length === 0) return 0;

    // Deliveries cascade.
    const result = await this.prisma.notification.deleteMany({
      where: { id: { in: old.map((row) => row.id) } },
    });

    return result.count;
  }
}
