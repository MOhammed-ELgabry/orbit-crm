import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

import {
  PRESENCE_DISCONNECT_GRACE_MS,
  PRESENCE_LEASE_TTL_MS,
  PRESENCE_SWEEP_INTERVAL_MS,
} from './chat.constants';
import type { PresenceDto } from './chat.types';
import { errorName } from './chat.utils';
import { ChatHub } from './chat-hub.service';

const UTC_NOW = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

const ms = (value: number) =>
  Prisma.sql`make_interval(secs => ${value / 1000})`;

export interface PresenceIdentity {
  connectionKey: string;
  userId: string;
  companyId: string;
}

/**
 * Presence = a set of short-lived LEASES, one per live connection.
 *
 *   online  <=>  the user has at least one lease with expiresAt > now
 *
 * so several tabs/devices behave correctly (closing one tab removes one
 * lease, the user stays online while another is valid) and an abandoned
 * connection (crash, network loss) stops counting when its lease expires —
 * nothing can keep a user online forever.
 *
 * Transitions (offline -> online, online -> offline) are decided inside a
 * transaction holding a per-user advisory lock, so two tabs connecting at the
 * same instant cannot both observe "I am the first" (or both "the last").
 *
 * "Last seen" is persisted in ChatUserPresence when the user's LAST lease
 * goes away, so it survives the lease rows being deleted.
 */
@Injectable()
export class ChatPresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatPresenceService.name);
  private sweepTimer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: ChatHub,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;

    this.sweepTimer = setInterval(() => {
      void this.sweep();
    }, PRESENCE_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /** Creates/renews the lease of one connection. Idempotent. */
  async touch(identity: PresenceIdentity): Promise<void> {
    const cameOnline = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, identity.companyId, identity.userId);

      const before = await this.countActive(
        tx,
        identity.companyId,
        identity.userId,
      );

      await tx.$executeRaw`
        INSERT INTO "ChatPresenceLease"
          ("connectionKey", "userKey", "userId", "companyId", "lastHeartbeat", "expiresAt", "createdAt")
        VALUES
          (${identity.connectionKey}, ${identity.userId}, ${identity.userId}, ${identity.companyId},
           ${UTC_NOW}, ${UTC_NOW} + ${ms(PRESENCE_LEASE_TTL_MS)}, ${UTC_NOW})
        ON CONFLICT ("connectionKey") DO UPDATE
          SET "lastHeartbeat" = ${UTC_NOW},
              "expiresAt" = ${UTC_NOW} + ${ms(PRESENCE_LEASE_TTL_MS)}
        WHERE "ChatPresenceLease"."userKey" = EXCLUDED."userKey"
          AND "ChatPresenceLease"."companyId" = EXCLUDED."companyId"`;

      return before === 0;
    });

    if (cameOnline) {
      this.hub.publish(
        { companyId: identity.companyId },
        {
          type: 'presence.update',
          userId: identity.userId,
          online: true,
          lastSeenAt: null,
        },
      );
    }
  }

  /**
   * A connection ended.
   *  - `immediate: false` (normal close, reload, token-expiry reconnect):
   *    the lease is shortened to a small grace period instead of deleted, so
   *    a quick reconnect never flashes the user offline; the sweeper
   *    finalises the transition if nobody comes back.
   *  - `immediate: true` (the user stopped being eligible): the lease is
   *    deleted and the transition happens now.
   */
  async release(
    identity: PresenceIdentity,
    options: { immediate: boolean },
  ): Promise<void> {
    const wentOffline = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, identity.companyId, identity.userId);

      if (options.immediate) {
        await tx.$executeRaw`
          DELETE FROM "ChatPresenceLease"
          WHERE "connectionKey" = ${identity.connectionKey}
            AND "userKey" = ${identity.userId}`;
      } else {
        await tx.$executeRaw`
          UPDATE "ChatPresenceLease"
          SET "lastHeartbeat" = ${UTC_NOW},
              "expiresAt" = LEAST("expiresAt", ${UTC_NOW} + ${ms(PRESENCE_DISCONNECT_GRACE_MS)})
          WHERE "connectionKey" = ${identity.connectionKey}
            AND "userKey" = ${identity.userId}`;
      }

      if (!options.immediate) return null;

      const remaining = await this.countActive(
        tx,
        identity.companyId,
        identity.userId,
      );

      return remaining === 0
        ? await this.recordLastSeen(tx, identity.companyId, identity.userId)
        : null;
    });

    if (wentOffline) {
      this.hub.publish(
        { companyId: identity.companyId },
        {
          type: 'presence.update',
          userId: identity.userId,
          online: false,
          lastSeenAt: wentOffline.toISOString(),
        },
      );
    }
  }

  /**
   * Removes expired leases and finalises offline transitions. Safe to run in
   * several processes at once (per-user locks), and idempotent.
   */
  async sweep(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;

    try {
      const expired = await this.prisma.$queryRaw<
        { companyId: string; userKey: string }[]
      >`
        SELECT DISTINCT "companyId", "userKey" FROM "ChatPresenceLease"
        WHERE "expiresAt" <= ${UTC_NOW}
        LIMIT 500`;

      let transitions = 0;

      for (const { companyId, userKey } of expired) {
        const wentOffline = await this.prisma.$transaction(async (tx) => {
          await this.lockUser(tx, companyId, userKey);

          const removed = await tx.$queryRaw<{ lastHeartbeat: Date }[]>`
            DELETE FROM "ChatPresenceLease"
            WHERE "companyId" = ${companyId} AND "userKey" = ${userKey}
              AND "expiresAt" <= ${UTC_NOW}
            RETURNING "lastHeartbeat"`;

          if (removed.length === 0) return null;

          const remaining = await this.countActive(tx, companyId, userKey);
          if (remaining > 0) return null;

          const latest = removed.reduce(
            (max, row) => (row.lastHeartbeat > max ? row.lastHeartbeat : max),
            removed[0].lastHeartbeat,
          );

          return this.recordLastSeen(tx, companyId, userKey, latest);
        });

        if (wentOffline) {
          transitions += 1;
          this.hub.publish(
            { companyId },
            {
              type: 'presence.update',
              userId: userKey,
              online: false,
              lastSeenAt: wentOffline.toISOString(),
            },
          );
        }
      }

      return transitions;
    } catch (error) {
      this.logger.error(`Presence sweep failed (${errorName(error)})`);
      return 0;
    } finally {
      this.sweeping = false;
    }
  }

  async getPresence(
    companyId: string,
    userIds: string[],
  ): Promise<Map<string, PresenceDto>> {
    const result = new Map<string, PresenceDto>();
    if (userIds.length === 0) return result;

    const online = await this.prisma.$queryRaw<{ userKey: string }[]>`
      SELECT DISTINCT "userKey" FROM "ChatPresenceLease"
      WHERE "companyId" = ${companyId}
        AND "userKey" IN (${Prisma.join(userIds)})
        AND "expiresAt" > ${UTC_NOW}`;

    const lastSeen = await this.prisma.$queryRaw<
      { userKey: string; lastSeenAt: Date }[]
    >`
      SELECT "userKey", "lastSeenAt" FROM "ChatUserPresence"
      WHERE "companyId" = ${companyId} AND "userKey" IN (${Prisma.join(userIds)})`;

    const onlineSet = new Set(online.map((row) => row.userKey));
    const seenMap = new Map(lastSeen.map((r) => [r.userKey, r.lastSeenAt]));

    for (const userId of userIds) {
      const isOnline = onlineSet.has(userId);
      const seen = seenMap.get(userId);

      result.set(userId, {
        online: isOnline,
        lastSeenAt: isOnline ? null : seen ? seen.toISOString() : null,
      });
    }

    return result;
  }

  // ---------------------------------------------------------------------

  private async lockUser(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`chat-presence:${companyId}:${userId}`}, 0))`;
  }

  private async countActive(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ count: bigint | number }[]>`
      SELECT count(*) AS "count" FROM "ChatPresenceLease"
      WHERE "companyId" = ${companyId} AND "userKey" = ${userId}
        AND "expiresAt" > ${UTC_NOW}`;

    return rows[0] ? Number(rows[0].count) : 0;
  }

  /** Stores and returns the user's last-seen instant (UTC). */
  private async recordLastSeen(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    at?: Date,
  ): Promise<Date> {
    const rows = await tx.$queryRaw<{ lastSeenAt: Date }[]>`
      INSERT INTO "ChatUserPresence" ("companyId", "userKey", "lastSeenAt", "updatedAt")
      VALUES (${companyId}, ${userId}, COALESCE((${at ? at.toISOString() : null}::timestamptz AT TIME ZONE 'UTC'), ${UTC_NOW}), ${UTC_NOW})
      ON CONFLICT ("companyId", "userKey") DO UPDATE
        SET "lastSeenAt" = GREATEST("ChatUserPresence"."lastSeenAt", EXCLUDED."lastSeenAt"),
            "updatedAt" = ${UTC_NOW}
      RETURNING "lastSeenAt"`;

    return rows[0].lastSeenAt;
  }
}
