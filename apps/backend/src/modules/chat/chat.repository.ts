import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { localAvatarOrNull } from '../user/avatar/avatar.constants';

import { TEAM_CONVERSATION_KEY } from './chat.constants';
import type {
  ChatActorRow,
  ChatConversationRow,
  ChatMessageRow,
  ChatPeerRow,
  ChatUserRow,
  DirectConversationListRow,
  IChatRepository,
  InsertMessageInput,
  InsertMessageResult,
  ListMessagesInput,
  MarkReadResult,
  TeamStateRow,
} from './chat.repository.interface';
import { newChatId } from './chat.utils';

/**
 * Current UTC wall-clock as a `timestamp without time zone`. Every raw
 * statement that writes or compares a timestamp uses this instead of
 * `now()`, so behaviour never depends on the database session time zone
 * (Prisma stores/reads these columns as UTC).
 */
const UTC_NOW = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

type ConversationRaw = {
  id: string;
  companyId: string;
  type: 'TEAM' | 'DIRECT';
  conversationKey: string;
  directUserLowKey: string | null;
  directUserHighKey: string | null;
  nextSequence: bigint | number;
  updatedAt: Date;
};

type MessageRaw = {
  id: string;
  conversationId: string;
  sequence: bigint | number;
  senderKey: string;
  senderName: string;
  senderAvatar: string | null;
  clientMessageId: string;
  body: string;
  audienceEpoch: bigint | number | null;
  createdAt: Date;
};

const num = (value: bigint | number): number => Number(value);

const toConversation = (row: ConversationRaw): ChatConversationRow => ({
  id: row.id,
  companyId: row.companyId,
  type: row.type,
  conversationKey: row.conversationKey,
  directUserLowKey: row.directUserLowKey,
  directUserHighKey: row.directUserHighKey,
  nextSequence: num(row.nextSequence),
  updatedAt: row.updatedAt,
});

const toMessage = (row: MessageRaw): ChatMessageRow => ({
  id: row.id,
  conversationId: row.conversationId,
  sequence: num(row.sequence),
  senderKey: row.senderKey,
  senderName: row.senderName,
  senderAvatar: row.senderAvatar,
  clientMessageId: row.clientMessageId,
  body: row.body,
  audienceEpoch: row.audienceEpoch === null ? null : num(row.audienceEpoch),
  createdAt: row.createdAt,
});

const CONVERSATION_COLUMNS = Prisma.sql`c."id", c."companyId", c."type", c."conversationKey",
  c."directUserLowKey", c."directUserHighKey", c."nextSequence", c."updatedAt"`;

const MESSAGE_COLUMNS = Prisma.sql`m."id", m."conversationId", m."sequence", m."senderKey",
  m."senderName", m."senderAvatar", m."clientMessageId", m."body",
  m."audienceEpoch", m."createdAt"`;

/**
 * Is `m.audienceEpoch` inside one of the viewer's membership intervals? This
 * is the historical-audience rule for TEAM history: a person sees the messages
 * that were sent while they were a member, not messages from before they
 * joined or from a period they were removed.
 */
const teamVisibility = (companyId: string, viewerId: string) => Prisma.sql`
  EXISTS (
    SELECT 1 FROM "TeamMembershipInterval" i
    WHERE i."companyId" = ${companyId}
      AND i."userKey" = ${viewerId}
      AND i."fromEpoch" <= m."audienceEpoch"
      AND (i."toEpoch" IS NULL OR m."audienceEpoch" < i."toEpoch")
  )`;

@Injectable()
export class ChatRepository implements IChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------

  async findActor(userId: string): Promise<ChatActorRow | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        deletedAt: null,
        companyId: { not: null },
        company: { is: { isActive: true, deletedAt: null } },
      },
      select: {
        id: true,
        companyId: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: { select: { name: true, deletedAt: true } },
      },
    });

    if (!user || !user.companyId) return null;

    return {
      id: user.id,
      companyId: user.companyId,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      roleName: user.role && !user.role.deletedAt ? user.role.name : null,
    };
  }

  async findEligibleUsers(
    companyId: string,
    options: { search?: string; limit: number },
  ): Promise<ChatUserRow[]> {
    const search = options.search?.trim();

    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
        deletedAt: null,
        company: { is: { isActive: true, deletedAt: null } },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      take: options.limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: { select: { name: true, deletedAt: true } },
      },
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      roleName: user.role && !user.role.deletedAt ? user.role.name : null,
    }));
  }

  async findPeers(
    companyId: string,
    userIds: string[],
  ): Promise<ChatPeerRow[]> {
    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        companyId: true,
        isActive: true,
        deletedAt: true,
        firstName: true,
        lastName: true,
        avatar: true,
        company: { select: { isActive: true, deletedAt: true } },
        role: { select: { name: true, deletedAt: true } },
      },
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      roleName: user.role && !user.role.deletedAt ? user.role.name : null,
      exists: true,
      eligible:
        user.companyId === companyId &&
        user.isActive &&
        user.deletedAt === null &&
        user.company !== null &&
        user.company.isActive &&
        user.company.deletedAt === null,
    }));
  }

  async getRoleNames(userIds: string[]): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (userIds.length === 0) return result;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, role: { select: { name: true, deletedAt: true } } },
    });

    for (const user of users) {
      result.set(
        user.id,
        user.role && !user.role.deletedAt ? user.role.name : null,
      );
    }

    return result;
  }

  async getAvatars(
    companyId: string,
    userIds: string[],
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (userIds.length === 0) return result;

    // companyId in the filter: a sender id is never trusted to belong to the
    // caller's company, so another company's user can never be resolved here.
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, companyId },
      select: { id: true, avatar: true },
    });

    for (const user of users) {
      result.set(user.id, localAvatarOrNull(user.avatar));
    }

    return result;
  }

  // ---------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------

  async ensureTeamConversation(
    companyId: string,
  ): Promise<ChatConversationRow> {
    // The unique (companyId, conversationKey) makes "exactly one team
    // conversation per company" a database fact; ON CONFLICT makes
    // concurrent first-use safe.
    await this.prisma.$executeRaw`
      INSERT INTO "ChatConversation" ("id", "companyId", "type", "conversationKey", "createdAt", "updatedAt")
      VALUES (${newChatId()}, ${companyId}, 'TEAM'::"ChatConversationType", ${TEAM_CONVERSATION_KEY}, ${UTC_NOW}, ${UTC_NOW})
      ON CONFLICT ("companyId", "conversationKey") DO NOTHING`;

    const rows = await this.prisma.$queryRaw<ConversationRaw[]>`
      SELECT ${CONVERSATION_COLUMNS} FROM "ChatConversation" c
      WHERE c."companyId" = ${companyId} AND c."conversationKey" = ${TEAM_CONVERSATION_KEY}`;

    return toConversation(rows[0]);
  }

  async findConversationById(id: string): Promise<ChatConversationRow | null> {
    const rows = await this.prisma.$queryRaw<ConversationRaw[]>`
      SELECT ${CONVERSATION_COLUMNS} FROM "ChatConversation" c WHERE c."id" = ${id}`;

    return rows[0] ? toConversation(rows[0]) : null;
  }

  async findDirectConversation(
    companyId: string,
    lowKey: string,
    highKey: string,
  ): Promise<ChatConversationRow | null> {
    const key = directConversationKey(lowKey, highKey);

    const rows = await this.prisma.$queryRaw<ConversationRaw[]>`
      SELECT ${CONVERSATION_COLUMNS} FROM "ChatConversation" c
      WHERE c."companyId" = ${companyId} AND c."conversationKey" = ${key}`;

    return rows[0] ? toConversation(rows[0]) : null;
  }

  async createDirectConversation(
    companyId: string,
    lowKey: string,
    highKey: string,
  ): Promise<ChatConversationRow> {
    const key = directConversationKey(lowKey, highKey);
    const conversationId = newChatId();

    // The conversation and BOTH participants are created in one transaction
    // (the deferred DB constraint rejects any other shape). A concurrent
    // creator of the same pair loses on the unique key; the winner's row is
    // returned instead, so the pair always maps to exactly one conversation.
    const inserted = await this.prisma.$transaction(async (tx) => {
      const count = await tx.$executeRaw`
        INSERT INTO "ChatConversation"
          ("id", "companyId", "type", "conversationKey", "directUserLowKey", "directUserHighKey", "createdAt", "updatedAt")
        VALUES
          (${conversationId}, ${companyId}, 'DIRECT'::"ChatConversationType", ${key}, ${lowKey}, ${highKey}, ${UTC_NOW}, ${UTC_NOW})
        ON CONFLICT ("companyId", "conversationKey") DO NOTHING`;

      if (count === 0) return false;

      await tx.$executeRaw`
        INSERT INTO "ChatParticipant" ("id", "conversationId", "participantKey", "userId", "createdAt")
        VALUES (${newChatId()}, ${conversationId}, ${lowKey}, ${lowKey}, ${UTC_NOW}),
               (${newChatId()}, ${conversationId}, ${highKey}, ${highKey}, ${UTC_NOW})`;

      return true;
    });

    const existing = await this.findDirectConversation(
      companyId,
      lowKey,
      highKey,
    );

    if (!existing) {
      // Cannot happen unless the row was purged between the two statements.
      throw new Error(
        `Direct conversation was not found after creation (created=${inserted}).`,
      );
    }

    return existing;
  }

  async isParticipant(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const count = await this.prisma.chatParticipant.count({
      where: { conversationId, participantKey: userId },
    });

    return count > 0;
  }

  async listDirectConversations(
    userId: string,
    companyId: string,
  ): Promise<DirectConversationListRow[]> {
    type Raw = ConversationRaw & {
      peerKey: string;
      myRead: bigint | number;
      peerRead: bigint | number;
      unread: bigint | number;
    };

    const rows = await this.prisma.$queryRaw<Raw[]>`
      SELECT ${CONVERSATION_COLUMNS},
             peer."participantKey" AS "peerKey",
             me."readSequence"     AS "myRead",
             peer."readSequence"   AS "peerRead",
             (SELECT count(*) FROM "ChatMessage" m
               WHERE m."conversationId" = c."id"
                 AND m."sequence" > me."readSequence"
                 AND m."senderKey" <> ${userId}) AS "unread"
      FROM "ChatConversation" c
      JOIN "ChatParticipant" me
        ON me."conversationId" = c."id" AND me."participantKey" = ${userId}
      JOIN "ChatParticipant" peer
        ON peer."conversationId" = c."id" AND peer."participantKey" <> ${userId}
      WHERE c."companyId" = ${companyId}
        AND c."type" = 'DIRECT'::"ChatConversationType"
        AND c."nextSequence" > 0
      ORDER BY c."updatedAt" DESC, c."id" ASC
      LIMIT 200`;

    return rows.map((row) => ({
      conversation: toConversation(row),
      peerKey: row.peerKey,
      myReadSequence: num(row.myRead),
      peerReadSequence: num(row.peerRead),
      unreadCount: num(row.unread),
    }));
  }

  async getTeamState(companyId: string, userId: string): Promise<TeamStateRow> {
    const conversation = await this.ensureTeamConversation(companyId);

    const cursorRows = await this.prisma.$queryRaw<
      { lastReadSequence: bigint | number }[]
    >`
      SELECT "lastReadSequence" FROM "ChatTeamReadCursor"
      WHERE "companyId" = ${companyId} AND "userKey" = ${userId}`;

    const readSequence = cursorRows[0]
      ? num(cursorRows[0].lastReadSequence)
      : 0;

    const unreadRows = await this.prisma.$queryRaw<
      { unread: bigint | number }[]
    >`
      SELECT count(*) AS "unread" FROM "ChatMessage" m
      WHERE m."conversationId" = ${conversation.id}
        AND m."sequence" > ${readSequence}
        AND m."senderKey" <> ${userId}
        AND ${teamVisibility(companyId, userId)}`;

    return {
      conversation,
      readSequence,
      unreadCount: unreadRows[0] ? num(unreadRows[0].unread) : 0,
    };
  }

  async getParticipantReadSequences(
    conversationId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.chatParticipant.findMany({
      where: { conversationId },
      select: { participantKey: true, readSequence: true },
    });

    return new Map(rows.map((r) => [r.participantKey, Number(r.readSequence)]));
  }

  // ---------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------

  async findMessageByClientId(
    conversationId: string,
    senderKey: string,
    clientMessageId: string,
  ): Promise<ChatMessageRow | null> {
    const rows = await this.prisma.$queryRaw<MessageRaw[]>`
      SELECT ${MESSAGE_COLUMNS} FROM "ChatMessage" m
      WHERE m."conversationId" = ${conversationId}
        AND m."senderKey" = ${senderKey}
        AND m."clientMessageId" = ${clientMessageId}`;

    return rows[0] ? toMessage(rows[0]) : null;
  }

  /**
   * Allocates the next sequence and persists the message ATOMICALLY.
   *
   * Lock order (always the same, so it cannot deadlock with itself):
   *   1. TEAM only: Company row FOR SHARE  -> freezes the membership epoch;
   *      a concurrent membership change (which needs FOR UPDATE) waits for
   *      this transaction instead of racing it.
   *   2. ChatConversation row UPDATE        -> allocates `nextSequence` and
   *      serialises every sender of the conversation until commit.
   *   3. ChatMessage INSERT                 -> the DB trigger re-validates
   *      sender eligibility, the epoch and `sequence = nextSequence`.
   *
   * Everything commits or rolls back together, so a sequence number can
   * never be consumed without a message (no gaps from failed sends) and two
   * messages can never share a sequence.
   */
  async insertMessage(input: InsertMessageInput): Promise<InsertMessageResult> {
    return this.prisma.$transaction(async (tx) => {
      let audienceEpoch: bigint | null = null;

      if (input.type === 'TEAM') {
        const epochRows = await tx.$queryRaw<
          { chatMembershipEpoch: bigint | number }[]
        >`
          SELECT "chatMembershipEpoch" FROM "Company"
          WHERE "id" = ${input.companyId} FOR SHARE`;

        if (!epochRows[0]) {
          throw new Error('Company row not found while sending a message.');
        }

        audienceEpoch = BigInt(epochRows[0].chatMembershipEpoch);
      }

      const sequenceRows = await tx.$queryRaw<
        { nextSequence: bigint | number }[]
      >`
        UPDATE "ChatConversation"
        SET "nextSequence" = "nextSequence" + 1, "updatedAt" = ${UTC_NOW}
        WHERE "id" = ${input.conversationId} AND "companyId" = ${input.companyId}
        RETURNING "nextSequence"`;

      if (!sequenceRows[0]) {
        throw new Error('Conversation not found while allocating a sequence.');
      }

      const sequence = BigInt(sequenceRows[0].nextSequence);

      const rows = await tx.$queryRaw<MessageRaw[]>`
        INSERT INTO "ChatMessage"
          ("id", "conversationId", "sequence", "senderKey", "senderId", "senderName",
           "senderAvatar", "clientMessageId", "body", "audienceEpoch", "createdAt")
        VALUES
          (${newChatId()}, ${input.conversationId}, ${sequence}, ${input.senderId}, ${input.senderId},
           ${input.senderName}, ${input.senderAvatar}, ${input.clientMessageId}, ${input.body},
           ${audienceEpoch}, ${UTC_NOW})
        RETURNING "id", "conversationId", "sequence", "senderKey", "senderName",
                  "senderAvatar", "clientMessageId", "body", "audienceEpoch", "createdAt"`;

      return { message: toMessage(rows[0]) };
    });
  }

  async listMessages(input: ListMessagesInput): Promise<ChatMessageRow[]> {
    const { conversation, viewerId, before, after, limit } = input;

    const visibility =
      conversation.type === 'TEAM'
        ? teamVisibility(conversation.companyId, viewerId)
        : Prisma.sql`TRUE`;

    // `after` pages forward (ascending); everything else pages backwards
    // from the newest message and is reversed so callers always receive
    // ascending sequence order.
    if (after !== undefined) {
      const rows = await this.prisma.$queryRaw<MessageRaw[]>`
        SELECT ${MESSAGE_COLUMNS} FROM "ChatMessage" m
        WHERE m."conversationId" = ${conversation.id}
          AND m."sequence" > ${after}
          AND ${visibility}
        ORDER BY m."sequence" ASC
        LIMIT ${limit}`;

      return rows.map(toMessage);
    }

    const beforeFilter =
      before !== undefined
        ? Prisma.sql`AND m."sequence" < ${before}`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<MessageRaw[]>`
      SELECT ${MESSAGE_COLUMNS} FROM "ChatMessage" m
      WHERE m."conversationId" = ${conversation.id}
        ${beforeFilter}
        AND ${visibility}
      ORDER BY m."sequence" DESC
      LIMIT ${limit}`;

    return rows.map(toMessage).reverse();
  }

  async getLastMessages(
    conversationIds: string[],
  ): Promise<Map<string, ChatMessageRow>> {
    const result = new Map<string, ChatMessageRow>();
    if (conversationIds.length === 0) return result;

    const rows = await this.prisma.$queryRaw<MessageRaw[]>`
      SELECT DISTINCT ON (m."conversationId") ${MESSAGE_COLUMNS}
      FROM "ChatMessage" m
      WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
      ORDER BY m."conversationId", m."sequence" DESC`;

    for (const row of rows) {
      result.set(row.conversationId, toMessage(row));
    }

    return result;
  }

  async getLastVisibleTeamMessage(
    conversation: ChatConversationRow,
    viewerId: string,
  ): Promise<ChatMessageRow | null> {
    const rows = await this.prisma.$queryRaw<MessageRaw[]>`
      SELECT ${MESSAGE_COLUMNS} FROM "ChatMessage" m
      WHERE m."conversationId" = ${conversation.id}
        AND ${teamVisibility(conversation.companyId, viewerId)}
      ORDER BY m."sequence" DESC
      LIMIT 1`;

    return rows[0] ? toMessage(rows[0]) : null;
  }

  // ---------------------------------------------------------------------
  // Audience / receipts
  // ---------------------------------------------------------------------

  async getAudienceMembers(
    companyId: string,
    epoch: number,
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ userKey: string }[]>`
      SELECT i."userKey" FROM "TeamMembershipInterval" i
      WHERE i."companyId" = ${companyId}
        AND i."fromEpoch" <= ${BigInt(epoch)}
        AND (i."toEpoch" IS NULL OR ${BigInt(epoch)} < i."toEpoch")`;

    return rows.map((row) => row.userKey);
  }

  async getCurrentMembers(companyId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ userKey: string }[]>`
      SELECT i."userKey" FROM "TeamMembershipInterval" i
      WHERE i."companyId" = ${companyId} AND i."toEpoch" IS NULL`;

    return rows.map((row) => row.userKey);
  }

  async getTeamCursors(companyId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<
      { userKey: string; lastReadSequence: bigint | number }[]
    >`
      SELECT "userKey", "lastReadSequence" FROM "ChatTeamReadCursor"
      WHERE "companyId" = ${companyId}`;

    return new Map(rows.map((r) => [r.userKey, num(r.lastReadSequence)]));
  }

  // ---------------------------------------------------------------------
  // Read state
  // ---------------------------------------------------------------------

  async markDirectRead(
    conversation: ChatConversationRow,
    readerId: string,
    upToSequence: number,
  ): Promise<MarkReadResult> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; readSequence: bigint | number }[]
      >`
        SELECT "id", "readSequence" FROM "ChatParticipant"
        WHERE "conversationId" = ${conversation.id} AND "participantKey" = ${readerId}
        FOR UPDATE`;

      if (!rows[0]) {
        throw new Error('Participant row not found while marking read.');
      }

      const current = num(rows[0].readSequence);

      const sequenceRows = await tx.$queryRaw<
        { nextSequence: bigint | number }[]
      >`
        SELECT "nextSequence" FROM "ChatConversation" WHERE "id" = ${conversation.id}`;

      const maxSequence = sequenceRows[0]
        ? num(sequenceRows[0].nextSequence)
        : 0;
      const target = Math.min(upToSequence, maxSequence);

      if (target <= current) {
        return {
          readSequence: current,
          previousSequence: current,
          advanced: false,
        };
      }

      // Durable per-message receipts first: the DB refuses to move the
      // cursor past an incoming message that has none.
      await tx.$executeRaw`
        INSERT INTO "DirectMessageRead" ("messageId", "readerKey", "readerUserId", "readAt")
        SELECT m."id", ${readerId}, ${readerId}, ${UTC_NOW}
        FROM "ChatMessage" m
        WHERE m."conversationId" = ${conversation.id}
          AND m."sequence" > ${current}
          AND m."sequence" <= ${target}
          AND m."senderKey" <> ${readerId}
        ON CONFLICT ("messageId") DO NOTHING`;

      await tx.$executeRaw`
        UPDATE "ChatParticipant" SET "readSequence" = ${BigInt(target)}
        WHERE "id" = ${rows[0].id}`;

      return {
        readSequence: target,
        previousSequence: current,
        advanced: true,
      };
    });
  }

  async countDirectUnread(
    conversationId: string,
    userId: string,
    readSequence: number,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ unread: bigint | number }[]>`
      SELECT count(*) AS "unread" FROM "ChatMessage" m
      WHERE m."conversationId" = ${conversationId}
        AND m."sequence" > ${readSequence}
        AND m."senderKey" <> ${userId}`;

    return rows[0] ? num(rows[0].unread) : 0;
  }

  async markTeamRead(
    conversation: ChatConversationRow,
    readerId: string,
    upToSequence: number,
  ): Promise<MarkReadResult> {
    return this.prisma.$transaction(async (tx) => {
      const existingRows = await tx.$queryRaw<
        { lastReadSequence: bigint | number }[]
      >`
        SELECT "lastReadSequence" FROM "ChatTeamReadCursor"
        WHERE "companyId" = ${conversation.companyId} AND "userKey" = ${readerId}
        FOR UPDATE`;

      const current = existingRows[0]
        ? num(existingRows[0].lastReadSequence)
        : 0;

      const sequenceRows = await tx.$queryRaw<
        { nextSequence: bigint | number }[]
      >`
        SELECT "nextSequence" FROM "ChatConversation" WHERE "id" = ${conversation.id}`;

      const maxSequence = sequenceRows[0]
        ? num(sequenceRows[0].nextSequence)
        : 0;
      const target = Math.min(upToSequence, maxSequence);

      if (target <= current) {
        return {
          readSequence: current,
          previousSequence: current,
          advanced: false,
        };
      }

      await tx.$executeRaw`
        INSERT INTO "ChatTeamReadCursor" ("companyId", "userKey", "lastReadSequence", "updatedAt")
        VALUES (${conversation.companyId}, ${readerId}, ${BigInt(target)}, ${UTC_NOW})
        ON CONFLICT ("companyId", "userKey") DO UPDATE
          SET "lastReadSequence" = GREATEST("ChatTeamReadCursor"."lastReadSequence", EXCLUDED."lastReadSequence"),
              "updatedAt" = ${UTC_NOW}`;

      return {
        readSequence: target,
        previousSequence: current,
        advanced: true,
      };
    });
  }
}

/**
 * Canonical key of a direct pair. Mirrors the DB CHECK constraint
 * (length-prefixed so no two different pairs can collide).
 */
export function directConversationKey(lowKey: string, highKey: string): string {
  return `DIRECT:${lowKey.length}:${lowKey}:${highKey.length}:${highKey}`;
}

/** Canonical ordering of a pair: byte order, same as COLLATE "C" in the DB. */
export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
