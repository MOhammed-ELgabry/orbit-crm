import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { newChatId } from '../chat.utils';

import type {
  ChatAttachmentContentType,
  ChatAttachmentKindName,
  ChatAttachmentStatusName,
} from './chat-attachments.constants';

/**
 * Persistence of the ChatAttachment table (migration
 * 20261030120000_add_chat_attachments).
 *
 * This file is the ONLY place that contains SQL about "ChatAttachment"
 * (including the statement that links a file to a message inside the
 * message-send transaction: see linkAttachmentToMessage).
 *
 * Why raw SQL here (same choice as ChatRepository, which is ~75% raw):
 *  - pg_advisory_xact_lock (per-company quota serialisation);
 *  - FOR UPDATE SKIP LOCKED (several instances sweeping safely);
 *  - conditional UPDATE ... RETURNING (state-machine transitions that report
 *    whether THIS call won, which Prisma's updateMany cannot return);
 *  - the database's own UTC clock for every expiry comparison, with the same
 *    UTC_NOW convention the chat repository uses.
 * Plain reads/counts could use the Prisma client; they stay raw so the whole
 * table is handled in one consistent, reviewable place.
 *
 * Every statement reachable from a request filters on the company id, and
 * the database triggers repeat the company / conversation / state rules
 * independently. Only the sweeper statements (claimExpired, findOldExpired,
 * deleteExpiredRows) are cross-company, because housekeeping is; they can
 * only see UPLOADING / READY / EXPIRED rows, never an ATTACHED one.
 */

/** UTC wall-clock as `timestamp without time zone` (same as chat.repository). */
const UTC_NOW = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

const afterSeconds = (seconds: number) =>
  Prisma.sql`(now() AT TIME ZONE 'UTC') + make_interval(secs => ${seconds}::double precision)`;

const beforeSeconds = (seconds: number) =>
  Prisma.sql`(now() AT TIME ZONE 'UTC') - make_interval(secs => ${seconds}::double precision)`;

export interface AttachmentRow {
  id: string;
  companyId: string;
  conversationId: string;
  messageId: string | null;
  uploaderKey: string;
  status: ChatAttachmentStatusName;
  kind: ChatAttachmentKindName;
  contentType: ChatAttachmentContentType;
  displayName: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  storageKey: string;
  createdAt: Date;
  readyAt: Date | null;
  attachedAt: Date | null;
  expiresAt: Date | null;
}

export interface ReserveAttachmentInput {
  companyId: string;
  conversationId: string;
  uploaderKey: string;
  kind: ChatAttachmentKindName;
  contentType: ChatAttachmentContentType;
  displayName: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  storageKey: string;
  uploadingTtlMs: number;
  maxPendingPerUser: number;
  maxDailyPerUser: number;
  companyQuotaBytes: number;
  globalQuotaBytes: number;
}

export type ReserveAttachmentResult =
  | { ok: true; row: AttachmentRow }
  | {
      ok: false;
      reason:
        'pending_limit' | 'daily_limit' | 'company_quota' | 'global_quota';
    };

export interface IChatAttachmentsRepository {
  countPendingForUser(uploaderKey: string, companyId: string): Promise<number>;
  countRecentForUser(uploaderKey: string, companyId: string): Promise<number>;
  usedBytes(companyId?: string): Promise<number>;
  reserve(input: ReserveAttachmentInput): Promise<ReserveAttachmentResult>;
  markReady(
    id: string,
    companyId: string,
    readyTtlMs: number,
  ): Promise<AttachmentRow | null>;
  findInConversation(
    id: string,
    conversationId: string,
    companyId: string,
  ): Promise<AttachmentRow | null>;
  findByMessageIds(
    companyId: string,
    messageIds: string[],
  ): Promise<AttachmentRow[]>;
  expireOwned(
    id: string,
    uploaderKey: string,
    companyId: string,
  ): Promise<AttachmentRow | null>;
  expireAny(id: string, companyId: string): Promise<void>;
  claimExpired(limit: number, graceMs: number): Promise<AttachmentRow[]>;
  findOldExpired(retentionMs: number, limit: number): Promise<AttachmentRow[]>;
  deleteExpiredRows(ids: string[]): Promise<number>;
}

type AttachmentRaw = Omit<AttachmentRow, 'sizeBytes' | 'width' | 'height'> & {
  sizeBytes: number | bigint;
  width: number | bigint | null;
  height: number | bigint | null;
};

const COLUMNS = Prisma.sql`a."id", a."companyId", a."conversationId", a."messageId",
  a."uploaderKey", a."status", a."kind", a."contentType", a."displayName",
  a."sizeBytes", a."sha256", a."width", a."height", a."storageKey",
  a."createdAt", a."readyAt", a."attachedAt", a."expiresAt"`;

/** RETURNING list for statements that cannot alias the table. */
const RETURNING = Prisma.sql`"id", "companyId", "conversationId", "messageId",
  "uploaderKey", "status", "kind", "contentType", "displayName",
  "sizeBytes", "sha256", "width", "height", "storageKey",
  "createdAt", "readyAt", "attachedAt", "expiresAt"`;

const toNumber = (value: number | bigint): number => Number(value);

const toRow = (raw: AttachmentRaw): AttachmentRow => ({
  ...raw,
  sizeBytes: toNumber(raw.sizeBytes),
  width: raw.width === null ? null : toNumber(raw.width),
  height: raw.height === null ? null : toNumber(raw.height),
});

/** Bytes that count against a quota: attached files + live pending ones. */
const COUNTED = Prisma.sql`(
  a."status" = 'ATTACHED'
  OR (a."status" IN ('UPLOADING', 'READY') AND a."expiresAt" > ${UTC_NOW})
)`;

@Injectable()
export class ChatAttachmentsRepository implements IChatAttachmentsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async countPendingForUser(
    uploaderKey: string,
    companyId: string,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint | number }[]>`
      SELECT count(*) AS "count" FROM "ChatAttachment" a
      WHERE a."uploaderKey" = ${uploaderKey} AND a."companyId" = ${companyId}
        AND a."status" IN ('UPLOADING', 'READY')
        AND a."expiresAt" > ${UTC_NOW}`;

    return Number(rows[0]?.count ?? 0);
  }

  /** Uploads started in the last 24 hours (any outcome). */
  async countRecentForUser(
    uploaderKey: string,
    companyId: string,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint | number }[]>`
      SELECT count(*) AS "count" FROM "ChatAttachment" a
      WHERE a."uploaderKey" = ${uploaderKey} AND a."companyId" = ${companyId}
        AND a."createdAt" > ${beforeSeconds(24 * 60 * 60)}`;

    return Number(rows[0]?.count ?? 0);
  }

  /** Counted bytes of one company, or of every company when omitted. */
  async usedBytes(companyId?: string): Promise<number> {
    const scope =
      companyId === undefined
        ? Prisma.empty
        : Prisma.sql`AND a."companyId" = ${companyId}`;

    const rows = await this.prisma.$queryRaw<
      { total: bigint | number | null }[]
    >`
      SELECT COALESCE(SUM(a."sizeBytes"), 0)::bigint AS "total"
      FROM "ChatAttachment" a
      WHERE ${COUNTED} ${scope}`;

    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Checks the limits and inserts the UPLOADING row in ONE transaction, under
   * a per-company advisory lock, so two uploads of the same company can never
   * both pass a quota that only one of them fits in.
   *
   * The global (all companies) cap is checked without a global lock: it can
   * be overshot by at most the few uploads that are in flight at that instant
   * (bounded by CHAT_ATTACHMENTS_MAX_CONCURRENT_UPLOADS). A global lock would
   * serialise every upload of every company for a soft safety margin.
   */
  async reserve(
    input: ReserveAttachmentInput,
  ): Promise<ReserveAttachmentResult> {
    return this.prisma.$transaction(async (tx) => {
      // $executeRaw, not $queryRaw: the function returns `void`, which the
      // query engine cannot deserialise as a result column.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`chat-attachments:${input.companyId}`}))`;

      const pending = await tx.$queryRaw<{ count: bigint | number }[]>`
        SELECT count(*) AS "count" FROM "ChatAttachment" a
        WHERE a."uploaderKey" = ${input.uploaderKey}
          AND a."companyId" = ${input.companyId}
          AND a."status" IN ('UPLOADING', 'READY')
          AND a."expiresAt" > ${UTC_NOW}`;

      if (Number(pending[0]?.count ?? 0) >= input.maxPendingPerUser) {
        return { ok: false, reason: 'pending_limit' } as const;
      }

      const daily = await tx.$queryRaw<{ count: bigint | number }[]>`
        SELECT count(*) AS "count" FROM "ChatAttachment" a
        WHERE a."uploaderKey" = ${input.uploaderKey}
          AND a."companyId" = ${input.companyId}
          AND a."createdAt" > ${beforeSeconds(24 * 60 * 60)}`;

      if (Number(daily[0]?.count ?? 0) >= input.maxDailyPerUser) {
        return { ok: false, reason: 'daily_limit' } as const;
      }

      const company = await tx.$queryRaw<{ total: bigint | number }[]>`
        SELECT COALESCE(SUM(a."sizeBytes"), 0)::bigint AS "total"
        FROM "ChatAttachment" a
        WHERE ${COUNTED} AND a."companyId" = ${input.companyId}`;

      if (
        Number(company[0]?.total ?? 0) + input.sizeBytes >
        input.companyQuotaBytes
      ) {
        return { ok: false, reason: 'company_quota' } as const;
      }

      const global = await tx.$queryRaw<{ total: bigint | number }[]>`
        SELECT COALESCE(SUM(a."sizeBytes"), 0)::bigint AS "total"
        FROM "ChatAttachment" a
        WHERE ${COUNTED}`;

      if (
        Number(global[0]?.total ?? 0) + input.sizeBytes >
        input.globalQuotaBytes
      ) {
        return { ok: false, reason: 'global_quota' } as const;
      }

      const rows = await tx.$queryRaw<AttachmentRaw[]>`
        INSERT INTO "ChatAttachment"
          ("id", "companyId", "conversationId", "uploaderKey", "status", "kind",
           "contentType", "displayName", "sizeBytes", "sha256", "width", "height",
           "storageKey", "createdAt", "expiresAt")
        VALUES
          (${newChatId()}, ${input.companyId}, ${input.conversationId},
           ${input.uploaderKey}, 'UPLOADING', ${input.kind}::"ChatAttachmentKind",
           ${input.contentType}, ${input.displayName}, ${input.sizeBytes},
           ${input.sha256}, ${input.width}, ${input.height}, ${input.storageKey},
           ${UTC_NOW}, ${afterSeconds(input.uploadingTtlMs / 1000)})
        RETURNING ${RETURNING}`;

      return { ok: true, row: toRow(rows[0]) } as const;
    });
  }

  /** UPLOADING -> READY (file is on disk and checked). Null if it moved on. */
  async markReady(
    id: string,
    companyId: string,
    readyTtlMs: number,
  ): Promise<AttachmentRow | null> {
    const rows = await this.prisma.$queryRaw<AttachmentRaw[]>`
      UPDATE "ChatAttachment"
      SET "status" = 'READY', "readyAt" = ${UTC_NOW},
          "expiresAt" = ${afterSeconds(readyTtlMs / 1000)}
      WHERE "id" = ${id} AND "companyId" = ${companyId}
        AND "status" = 'UPLOADING'
      RETURNING ${RETURNING}`;

    return rows[0] ? toRow(rows[0]) : null;
  }

  /**
   * An attachment, only if it belongs to this conversation AND this company
   * (the caller already authorised the conversation).
   */
  async findInConversation(
    id: string,
    conversationId: string,
    companyId: string,
  ): Promise<AttachmentRow | null> {
    const rows = await this.prisma.$queryRaw<AttachmentRaw[]>`
      SELECT ${COLUMNS} FROM "ChatAttachment" a
      WHERE a."id" = ${id}
        AND a."conversationId" = ${conversationId}
        AND a."companyId" = ${companyId}`;

    return rows[0] ? toRow(rows[0]) : null;
  }

  async findByMessageIds(
    companyId: string,
    messageIds: string[],
  ): Promise<AttachmentRow[]> {
    if (messageIds.length === 0) return [];

    const rows = await this.prisma.$queryRaw<AttachmentRaw[]>`
      SELECT ${COLUMNS} FROM "ChatAttachment" a
      WHERE a."messageId" IN (${Prisma.join(messageIds)})
        AND a."companyId" = ${companyId}
        AND a."status" = 'ATTACHED'`;

    return rows.map(toRow);
  }

  /** The uploader cancels an attachment that was not sent yet. */
  async expireOwned(
    id: string,
    uploaderKey: string,
    companyId: string,
  ): Promise<AttachmentRow | null> {
    const rows = await this.prisma.$queryRaw<AttachmentRaw[]>`
      UPDATE "ChatAttachment"
      SET "status" = 'EXPIRED', "expiresAt" = ${UTC_NOW}
      WHERE "id" = ${id} AND "uploaderKey" = ${uploaderKey}
        AND "companyId" = ${companyId}
        AND "status" IN ('UPLOADING', 'READY')
      RETURNING ${RETURNING}`;

    return rows[0] ? toRow(rows[0]) : null;
  }

  /** Internal failure path (the file could not be stored). */
  async expireAny(id: string, companyId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "ChatAttachment"
      SET "status" = 'EXPIRED', "expiresAt" = ${UTC_NOW}
      WHERE "id" = ${id} AND "companyId" = ${companyId}
        AND "status" IN ('UPLOADING', 'READY')`;
  }

  /**
   * Atomically turns overdue UPLOADING / READY rows into EXPIRED and returns
   * them so the caller can remove their files. SKIP LOCKED lets several
   * instances sweep at once without handling the same row. A row that has
   * been attached never matches (its status is ATTACHED).
   */
  async claimExpired(limit: number, graceMs: number): Promise<AttachmentRow[]> {
    const rows = await this.prisma.$queryRaw<AttachmentRaw[]>`
      UPDATE "ChatAttachment"
      SET "status" = 'EXPIRED'
      WHERE "id" IN (
        SELECT s."id" FROM "ChatAttachment" s
        WHERE s."status" IN ('UPLOADING', 'READY')
          AND s."expiresAt" < ${beforeSeconds(graceMs / 1000)}
        ORDER BY s."expiresAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      ) AND "status" IN ('UPLOADING', 'READY')
      RETURNING ${RETURNING}`;

    return rows.map(toRow);
  }

  /** EXPIRED rows past the retention period (their files go first). */
  async findOldExpired(
    retentionMs: number,
    limit: number,
  ): Promise<AttachmentRow[]> {
    const rows = await this.prisma.$queryRaw<AttachmentRaw[]>`
      SELECT ${COLUMNS} FROM "ChatAttachment" a
      WHERE a."status" = 'EXPIRED'
        AND a."expiresAt" < ${beforeSeconds(retentionMs / 1000)}
      ORDER BY a."expiresAt"
      LIMIT ${limit}`;

    return rows.map(toRow);
  }

  /**
   * Deletes EXPIRED rows only. Rows linked to a message are ATTACHED, never
   * match, and the database trigger would refuse them anyway.
   */
  async deleteExpiredRows(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    return this.prisma.$executeRaw`
      DELETE FROM "ChatAttachment"
      WHERE "id" IN (${Prisma.join(ids)}) AND "status" = 'EXPIRED'
        AND "messageId" IS NULL`;
  }
}

export interface LinkAttachmentInput {
  attachmentId: string;
  messageId: string;
  companyId: string;
  conversationId: string;
  /** The sender of the message: only the uploader may attach a file. */
  uploaderKey: string;
}

/**
 * READY -> ATTACHED, executed INSIDE the message-send transaction (`tx` is the
 * transaction client of ChatRepository.insertMessage), after the message row
 * exists and while the conversation row is locked by the sequence allocation.
 * Returns false when the file is not linkable (wrong company / conversation /
 * uploader, not READY, expired, or already used); the caller then rolls the
 * whole send back. The database trigger re-validates the same rules and that
 * the message is the newest of the conversation.
 *
 * It never reads or changes who may see a message or a conversation.
 */
export async function linkAttachmentToMessage(
  tx: Prisma.TransactionClient,
  input: LinkAttachmentInput,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "ChatAttachment"
    SET "status" = 'ATTACHED', "messageId" = ${input.messageId},
        "attachedAt" = ${UTC_NOW}, "expiresAt" = NULL
    WHERE "id" = ${input.attachmentId}
      AND "companyId" = ${input.companyId}
      AND "conversationId" = ${input.conversationId}
      AND "uploaderKey" = ${input.uploaderKey}
      AND "status" = 'READY'
      AND "expiresAt" > ${UTC_NOW}
    RETURNING "id"`;

  return rows.length === 1;
}
