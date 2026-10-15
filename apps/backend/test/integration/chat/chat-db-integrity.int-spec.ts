/**
 * Team chat - database integrity (integration).
 *
 * Runs against the real PostgreSQL test database (`orbitcrm_test` only, via
 * the shared harness guard) with the 20261011180000_add_team_chat migration
 * applied. Every case here exists because the Codex draft migration was
 * executed and the defect REPRODUCED (see docs/team-chat/REVIEW.md), or
 * because it is an invariant the chat design relies on:
 *
 *   - participant identity is immutable (no moving a row between direct
 *     conversations, which used to leave the old one with a single
 *     participant);
 *   - direct receipts / persisted messages cannot be rewritten or deleted;
 *   - message.sequence is tied to the conversation counter;
 *   - direct conversations/participants stay inside one company; TEAM
 *     conversations have no participants;
 *   - membership epochs/intervals follow user and company lifecycle;
 *   - the audience epoch is frozen at send time and a racing membership
 *     change cannot produce an ambiguous boundary;
 *   - cursors are monotonic and bounded;
 *   - history survives user/company state changes.
 *
 * All rows are created through SQL with marker companies/users registered in
 * the harness ledger; clean-up goes through harness.cleanup(), which purges
 * the chat rows by validated company IDs.
 */
import { randomUUID } from 'crypto';

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

interface Fixture {
  companyA: string;
  companyB: string;
  a: string;
  b: string;
  c: string;
  d: string; // other company
}

/** `orbit.chat_purge` is a transaction-local opt-in; tests never need it. */

describe('Team chat database integrity (integration)', () => {
  let harness: TestHarness;
  let f: Fixture;
  let seq = 0; // keeps e-mails unique when a label is reused

  const prismaRaw = () => harness.prisma;

  async function exec(sql: string, ...params: unknown[]): Promise<number> {
    return prismaRaw().$executeRawUnsafe(sql, ...params);
  }

  async function rows<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<T[]> {
    return prismaRaw().$queryRawUnsafe<T[]>(sql, ...params);
  }

  async function createCompany(label: string): Promise<string> {
    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName(label) },
      select: { id: true },
    });
    harness.registerCompany(company.id);
    return company.id;
  }

  async function createUser(
    label: string,
    companyId: string,
    overrides: { isActive?: boolean } = {},
  ): Promise<string> {
    const user = await harness.prisma.user.create({
      data: {
        firstName: label,
        lastName: 'Chat',
        email: harness.uniqueEmail(`${label}-${++seq}`),
        isEmailVerified: true,
        isActive: overrides.isActive ?? true,
        companyId,
      },
      select: { id: true },
    });
    harness.registerUser(user.id);
    return user.id;
  }

  const pair = (x: string, y: string): [string, string] =>
    x < y ? [x, y] : [y, x];

  const directKey = (low: string, high: string) =>
    `DIRECT:${low.length}:${low}:${high.length}:${high}`;

  async function createDirect(
    companyId: string,
    x: string,
    y: string,
  ): Promise<{ id: string; low: string; high: string }> {
    const [low, high] = pair(x, y);
    const id = randomUUID();

    await prismaRaw().$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "ChatConversation" ("id","companyId","type","conversationKey","directUserLowKey","directUserHighKey","updatedAt")
         VALUES ($1,$2,'DIRECT',$3,$4,$5,(now() AT TIME ZONE 'UTC'))`,
        id,
        companyId,
        directKey(low, high),
        low,
        high,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "ChatParticipant" ("id","conversationId","participantKey","userId")
         VALUES ($1,$2,$3,$3),($4,$2,$5,$5)`,
        randomUUID(),
        id,
        low,
        randomUUID(),
        high,
      );
    });

    return { id, low, high };
  }

  async function createTeam(companyId: string): Promise<string> {
    const id = randomUUID();
    await exec(
      `INSERT INTO "ChatConversation" ("id","companyId","type","conversationKey","updatedAt")
       VALUES ($1,$2,'TEAM','TEAM',(now() AT TIME ZONE 'UTC'))`,
      id,
      companyId,
    );
    return id;
  }

  async function epochOf(companyId: string): Promise<number> {
    const r = await rows<{ e: bigint }>(
      `SELECT "chatMembershipEpoch" AS e FROM "Company" WHERE id = $1`,
      companyId,
    );
    return Number(r[0].e);
  }

  /** Allocates the next sequence and inserts, exactly like the repository. */
  async function sendRaw(input: {
    conversationId: string;
    companyId: string;
    sender: string;
    team: boolean;
    clientMessageId?: string;
    body?: string;
    epochOverride?: number | null;
  }): Promise<{ id: string; sequence: number }> {
    return prismaRaw().$transaction(async (tx) => {
      let epoch: number | null = null;
      if (input.team) {
        const e = await tx.$queryRawUnsafe<{ e: bigint }[]>(
          `SELECT "chatMembershipEpoch" AS e FROM "Company" WHERE id = $1 FOR SHARE`,
          input.companyId,
        );
        epoch = Number(e[0].e);
      }
      if (input.epochOverride !== undefined) epoch = input.epochOverride;

      const seq = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `UPDATE "ChatConversation" SET "nextSequence" = "nextSequence" + 1
         WHERE id = $1 RETURNING "nextSequence" AS n`,
        input.conversationId,
      );
      const sequence = Number(seq[0].n);
      const id = randomUUID();

      await tx.$executeRawUnsafe(
        `INSERT INTO "ChatMessage" ("id","conversationId","sequence","senderKey","senderId","senderName","clientMessageId","body","audienceEpoch")
         VALUES ($1,$2,$3,$4,$4,'Sender',$5,$6,$7)`,
        id,
        input.conversationId,
        BigInt(sequence),
        input.sender,
        input.clientMessageId ?? randomUUID(),
        input.body ?? 'hello',
        epoch === null ? null : BigInt(epoch),
      );

      return { id, sequence };
    });
  }

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.assertDatabaseIdentity();
    await harness.recoverOrphans();

    const companyA = await createCompany('chat-db-a');
    const companyB = await createCompany('chat-db-b');

    f = {
      companyA,
      companyB,
      a: await createUser('a', companyA),
      b: await createUser('b', companyA),
      c: await createUser('c', companyA),
      d: await createUser('d', companyB),
    };
  });

  /**
   * A direct conversation is unique per (company, pair) by design, so every
   * test gets its own fresh users in company A (company B / `d` stay shared).
   */
  beforeEach(async () => {
    f = {
      ...f,
      a: await createUser('a', f.companyA),
      b: await createUser('b', f.companyA),
      c: await createUser('c', f.companyA),
    };
  });

  afterAll(async () => {
    try {
      const report = await harness.cleanup();
      console.log(
        `[chat-db-integrity] cleanup deleted: ${JSON.stringify(report.deleted)}`,
      );
    } finally {
      await harness.close();
    }
  }, 180_000);

  // -------------------------------------------------------------------
  describe('membership epochs and intervals', () => {
    it('opens exactly one interval per eligible user as they are created', async () => {
      const open = await rows<{ userKey: string }>(
        `SELECT "userKey" FROM "TeamMembershipInterval"
         WHERE "companyId" = $1 AND "toEpoch" IS NULL AND "userKey" = ANY($2::text[])`,
        f.companyA,
        [f.a, f.b, f.c],
      );

      expect(open.map((r) => r.userKey).sort()).toEqual([f.a, f.b, f.c].sort());
      expect(await epochOf(f.companyA)).toBeGreaterThanOrEqual(3);
    });

    it('closes the interval on deactivation and opens a new one on reactivation', async () => {
      const user = await createUser('toggle', f.companyA);
      const before = await epochOf(f.companyA);

      await exec(`UPDATE "User" SET "isActive" = false WHERE id = $1`, user);
      const closed = await rows<{ toEpoch: bigint | null }>(
        `SELECT "toEpoch" FROM "TeamMembershipInterval"
         WHERE "companyId" = $1 AND "userKey" = $2`,
        f.companyA,
        user,
      );
      expect(closed).toHaveLength(1);
      expect(Number(closed[0].toEpoch)).toBe(before + 1);

      await exec(`UPDATE "User" SET "isActive" = true WHERE id = $1`, user);
      const all = await rows<{ fromEpoch: bigint; toEpoch: bigint | null }>(
        `SELECT "fromEpoch","toEpoch" FROM "TeamMembershipInterval"
         WHERE "companyId" = $1 AND "userKey" = $2 ORDER BY "fromEpoch"`,
        f.companyA,
        user,
      );
      expect(all).toHaveLength(2);
      expect(all[1].toEpoch).toBeNull();
      expect(Number(all[1].fromEpoch)).toBe(before + 2);
    });

    it('closes the interval on soft delete', async () => {
      const user = await createUser('softdel', f.companyA);
      await exec(`UPDATE "User" SET "deletedAt" = now() WHERE id = $1`, user);

      const open = await rows(
        `SELECT 1 FROM "TeamMembershipInterval"
         WHERE "companyId" = $1 AND "userKey" = $2 AND "toEpoch" IS NULL`,
        f.companyA,
        user,
      );
      expect(open).toHaveLength(0);
    });

    it('moves a user between companies atomically (old closed, new opened)', async () => {
      const user = await createUser('mover', f.companyA);
      await exec(
        `UPDATE "User" SET "companyId" = $1 WHERE id = $2`,
        f.companyB,
        user,
      );

      const intervals = await rows<{
        companyId: string;
        toEpoch: bigint | null;
      }>(
        `SELECT "companyId","toEpoch" FROM "TeamMembershipInterval" WHERE "userKey" = $1`,
        user,
      );
      const inA = intervals.find((i) => i.companyId === f.companyA);
      const inB = intervals.find((i) => i.companyId === f.companyB);
      expect(inA?.toEpoch).not.toBeNull();
      expect(inB?.toEpoch).toBeNull();
    });

    it('closes every interval when the company is deactivated and reopens them on reactivation', async () => {
      const company = await createCompany('chat-db-toggle');
      const u1 = await createUser('t1', company);
      const u2 = await createUser('t2', company);

      await exec(
        `UPDATE "Company" SET "isActive" = false WHERE id = $1`,
        company,
      );
      expect(
        await rows(
          `SELECT 1 FROM "TeamMembershipInterval" WHERE "companyId" = $1 AND "toEpoch" IS NULL`,
          company,
        ),
      ).toHaveLength(0);

      await exec(
        `UPDATE "Company" SET "isActive" = true WHERE id = $1`,
        company,
      );
      const open = await rows<{ userKey: string }>(
        `SELECT "userKey" FROM "TeamMembershipInterval" WHERE "companyId" = $1 AND "toEpoch" IS NULL`,
        company,
      );
      expect(open.map((r) => r.userKey).sort()).toEqual([u1, u2].sort());
    });

    it('allows at most one open interval per user (partial unique index)', async () => {
      await expect(
        exec(
          `INSERT INTO "TeamMembershipInterval" ("id","companyId","userKey","fromEpoch")
           VALUES ($1,$2,$3,9999)`,
          randomUUID(),
          f.companyA,
          f.a,
        ),
      ).rejects.toThrow();
    });

    it('does not let an interval be rewritten, only closed', async () => {
      await expect(
        exec(
          `UPDATE "TeamMembershipInterval" SET "fromEpoch" = 0 WHERE "companyId" = $1 AND "userKey" = $2`,
          f.companyA,
          f.a,
        ),
      ).rejects.toThrow(/may only be closed/);
    });
  });

  // -------------------------------------------------------------------
  describe('conversations and participants', () => {
    it('rejects a direct pair stored in the wrong (non-canonical) order', async () => {
      const [low, high] = pair(f.a, f.b);

      await expect(
        exec(
          `INSERT INTO "ChatConversation" ("id","companyId","type","conversationKey","directUserLowKey","directUserHighKey","updatedAt")
           VALUES ($1,$2,'DIRECT',$3,$4,$5,now())`,
          randomUUID(),
          f.companyA,
          directKey(high, low),
          high,
          low,
        ),
      ).rejects.toThrow();
    });

    it('rejects a direct conversation between users of different companies', async () => {
      await expect(createDirect(f.companyA, f.a, f.d)).rejects.toThrow(
        /must belong to the conversation company/,
      );
    });

    it('returns the same conversation for the same pair (unique canonical key)', async () => {
      const first = await createDirect(f.companyA, f.a, f.b);

      await expect(createDirect(f.companyA, f.b, f.a)).rejects.toThrow();

      const found = await rows(
        `SELECT id FROM "ChatConversation" WHERE "companyId" = $1 AND "conversationKey" = $2`,
        f.companyA,
        directKey(first.low, first.high),
      );
      expect(found).toHaveLength(1);
    });

    it('rejects, at commit, a direct conversation with fewer than two participants', async () => {
      const [low, high] = pair(f.b, f.c);
      const id = randomUUID();

      // One DO block = one implicit transaction, so the DEFERRED constraint
      // trigger fires when that statement commits (all values are ids that
      // this spec generated itself).
      await expect(
        exec(
          `DO $$
           BEGIN
             INSERT INTO "ChatConversation" ("id","companyId","type","conversationKey","directUserLowKey","directUserHighKey","updatedAt")
             VALUES ('${id}','${f.companyA}','DIRECT','${directKey(low, high)}','${low}','${high}',(now() AT TIME ZONE 'UTC'));
             INSERT INTO "ChatParticipant" ("id","conversationId","participantKey","userId")
             VALUES ('${randomUUID()}','${id}','${low}','${low}');
           END $$`,
        ),
      ).rejects.toThrow(/exactly its two canonical participants/);

      const left = await rows(
        `SELECT 1 FROM "ChatConversation" WHERE id = $1`,
        id,
      );
      expect(left).toHaveLength(0);
    });

    it('rejects a participant outside the canonical pair', async () => {
      const dm = await createDirect(f.companyA, f.a, f.c);

      await expect(
        exec(
          `INSERT INTO "ChatParticipant" ("id","conversationId","participantKey","userId") VALUES ($1,$2,$3,$3)`,
          randomUUID(),
          dm.id,
          f.b,
        ),
      ).rejects.toThrow();
    });

    it('rejects participant rows on a TEAM conversation (incl. another tenant)', async () => {
      const team = await createTeam(f.companyA);

      await expect(
        exec(
          `INSERT INTO "ChatParticipant" ("id","conversationId","participantKey","userId") VALUES ($1,$2,$3,$3)`,
          randomUUID(),
          team,
          f.d,
        ),
      ).rejects.toThrow(/only direct conversations have participant rows/);
    });

    it('allows only one TEAM conversation per company', async () => {
      await expect(createTeam(f.companyA)).rejects.toThrow();
    });

    it('REGRESSION: a participant row cannot be moved to another conversation', async () => {
      const x = await createDirect(f.companyA, f.a, f.b);
      const y = await createDirect(f.companyA, f.a, f.c);

      const aInX = await rows<{ id: string }>(
        `SELECT id FROM "ChatParticipant" WHERE "conversationId" = $1 AND "participantKey" = $2`,
        x.id,
        f.a,
      );

      await expect(
        exec(
          `UPDATE "ChatParticipant" SET "conversationId" = $1 WHERE id = $2`,
          y.id,
          aInX[0].id,
        ),
      ).rejects.toThrow(/identity is immutable/);

      const left = await rows(
        `SELECT 1 FROM "ChatParticipant" WHERE "conversationId" = $1`,
        x.id,
      );
      expect(left).toHaveLength(2);
    });

    it('rejects deleting a participant (history cannot be reduced)', async () => {
      const dm = await createDirect(f.companyA, f.b, f.c);

      await expect(
        exec(
          `DELETE FROM "ChatParticipant" WHERE "conversationId" = $1`,
          dm.id,
        ),
      ).rejects.toThrow(/cannot be deleted/);
    });

    it('keeps conversation identity immutable and the sequence monotonic', async () => {
      const dm = await createDirect(f.companyA, f.a, f.b);

      await expect(
        exec(
          `UPDATE "ChatConversation" SET "companyId" = $1 WHERE id = $2`,
          f.companyB,
          dm.id,
        ),
      ).rejects.toThrow(/immutable/);

      await exec(
        `UPDATE "ChatConversation" SET "nextSequence" = 5 WHERE id = $1`,
        dm.id,
      );
      await expect(
        exec(
          `UPDATE "ChatConversation" SET "nextSequence" = 4 WHERE id = $1`,
          dm.id,
        ),
      ).rejects.toThrow(/cannot move backwards/);
    });
  });

  // -------------------------------------------------------------------
  describe('messages', () => {
    it('REGRESSION: rejects a sequence that is not the allocated one', async () => {
      const dm = await createDirect(f.companyA, f.a, f.b);

      await expect(
        exec(
          `INSERT INTO "ChatMessage" ("id","conversationId","sequence","senderKey","senderId","senderName","clientMessageId","body")
           VALUES ($1,$2,5,$3,$3,'A',$4,'x')`,
          randomUUID(),
          dm.id,
          f.a,
          randomUUID(),
        ),
      ).rejects.toThrow(/allocated conversation sequence/);
    });

    it('persists a valid direct message with the allocated sequence', async () => {
      const dm = await createDirect(f.companyA, f.a, f.b);
      const sent = await sendRaw({
        conversationId: dm.id,
        companyId: f.companyA,
        sender: f.a,
        team: false,
      });
      expect(sent.sequence).toBe(1);
    });

    it('is idempotent per (conversation, sender, clientMessageId)', async () => {
      const dm = await createDirect(f.companyA, f.a, f.b);
      const clientMessageId = randomUUID();

      await sendRaw({
        conversationId: dm.id,
        companyId: f.companyA,
        sender: f.a,
        team: false,
        clientMessageId,
      });
      await expect(
        sendRaw({
          conversationId: dm.id,
          companyId: f.companyA,
          sender: f.a,
          team: false,
          clientMessageId,
        }),
      ).rejects.toThrow();

      const stored = await rows(
        `SELECT 1 FROM "ChatMessage" WHERE "conversationId" = $1`,
        dm.id,
      );
      expect(stored).toHaveLength(1);
      // The failed attempt rolled back its sequence allocation too.
      const counter = await rows<{ n: bigint }>(
        `SELECT "nextSequence" AS n FROM "ChatConversation" WHERE id = $1`,
        dm.id,
      );
      expect(Number(counter[0].n)).toBe(1);
    });

    it('REGRESSION: persisted messages are immutable and cannot be moved or deleted', async () => {
      const dm = await createDirect(f.companyA, f.a, f.b);
      const other = await createDirect(f.companyA, f.a, f.c);
      const sent = await sendRaw({
        conversationId: dm.id,
        companyId: f.companyA,
        sender: f.a,
        team: false,
      });

      await expect(
        exec(
          `UPDATE "ChatMessage" SET body = 'tampered' WHERE id = $1`,
          sent.id,
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        exec(
          `UPDATE "ChatMessage" SET "senderKey" = $1, "senderId" = $1 WHERE id = $2`,
          f.b,
          sent.id,
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        exec(
          `UPDATE "ChatMessage" SET "conversationId" = $1 WHERE id = $2`,
          other.id,
          sent.id,
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        exec(`DELETE FROM "ChatMessage" WHERE id = $1`, sent.id),
      ).rejects.toThrow(/cannot be deleted/);
    });

    it('rejects a sender from another company and a deactivated sender', async () => {
      const team = await createTeam(f.companyB);
      await expect(
        sendRaw({
          conversationId: team,
          companyId: f.companyB,
          sender: f.a,
          team: true,
        }),
      ).rejects.toThrow(/not eligible/);

      const inactive = await createUser('inactive', f.companyA, {
        isActive: false,
      });
      const dm = await createDirect(f.companyA, f.a, inactive);
      await expect(
        sendRaw({
          conversationId: dm.id,
          companyId: f.companyA,
          sender: f.a,
          team: false,
        }),
      ).rejects.toThrow(/recipient is not eligible/);
    });

    it('freezes the team audience epoch and rejects a stale or missing one', async () => {
      const company = await createCompany('chat-db-epoch');
      const sender = await createUser('es', company);
      const team = await createTeam(company);

      await expect(
        sendRaw({
          conversationId: team,
          companyId: company,
          sender,
          team: true,
          epochOverride: 0,
        }),
      ).rejects.toThrow(/stale or missing/);
      await expect(
        sendRaw({
          conversationId: team,
          companyId: company,
          sender,
          team: true,
          epochOverride: null,
        }),
      ).rejects.toThrow(/stale or missing/);

      const ok = await sendRaw({
        conversationId: team,
        companyId: company,
        sender,
        team: true,
      });
      const stored = await rows<{ e: bigint }>(
        `SELECT "audienceEpoch" AS e FROM "ChatMessage" WHERE id = $1`,
        ok.id,
      );
      expect(Number(stored[0].e)).toBe(await epochOf(company));
    });

    it('REGRESSION: a direct receipt cannot be re-assigned to another reader or message', async () => {
      const dm = await createDirect(f.companyA, f.a, f.b);
      const m1 = await sendRaw({
        conversationId: dm.id,
        companyId: f.companyA,
        sender: f.a,
        team: false,
      });
      const m2 = await sendRaw({
        conversationId: dm.id,
        companyId: f.companyA,
        sender: f.a,
        team: false,
      });

      await exec(
        `INSERT INTO "DirectMessageRead" ("messageId","readerKey","readerUserId") VALUES ($1,$2,$2)`,
        m1.id,
        f.b,
      );

      await expect(
        exec(
          `UPDATE "DirectMessageRead" SET "readerKey" = $1, "readerUserId" = $1 WHERE "messageId" = $2`,
          f.c,
          m1.id,
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        exec(
          `UPDATE "DirectMessageRead" SET "messageId" = $1 WHERE "messageId" = $2`,
          m2.id,
          m1.id,
        ),
      ).rejects.toThrow(/immutable/);

      // INSERT-time rules: not the sender, must be the other participant.
      await expect(
        exec(
          `INSERT INTO "DirectMessageRead" ("messageId","readerKey","readerUserId") VALUES ($1,$2,$2)`,
          m2.id,
          f.a,
        ),
      ).rejects.toThrow(/only the other direct participant/);
      await expect(
        exec(
          `INSERT INTO "DirectMessageRead" ("messageId","readerKey","readerUserId") VALUES ($1,$2,$2)`,
          m2.id,
          f.c,
        ),
      ).rejects.toThrow(/only the other direct participant/);
    });
  });

  // -------------------------------------------------------------------
  describe('read cursors', () => {
    it('direct cursor: needs receipts, is monotonic and bounded', async () => {
      const dm = await createDirect(f.companyA, f.a, f.b);
      const m1 = await sendRaw({
        conversationId: dm.id,
        companyId: f.companyA,
        sender: f.a,
        team: false,
      });
      await sendRaw({
        conversationId: dm.id,
        companyId: f.companyA,
        sender: f.a,
        team: false,
      });

      // Cannot pass an unread incoming message.
      await expect(
        exec(
          `UPDATE "ChatParticipant" SET "readSequence" = 1 WHERE "conversationId" = $1 AND "participantKey" = $2`,
          dm.id,
          f.b,
        ),
      ).rejects.toThrow(/unread incoming message/);

      await exec(
        `INSERT INTO "DirectMessageRead" ("messageId","readerKey","readerUserId") VALUES ($1,$2,$2)`,
        m1.id,
        f.b,
      );
      await exec(
        `UPDATE "ChatParticipant" SET "readSequence" = 1 WHERE "conversationId" = $1 AND "participantKey" = $2`,
        dm.id,
        f.b,
      );

      await expect(
        exec(
          `UPDATE "ChatParticipant" SET "readSequence" = 0 WHERE "conversationId" = $1 AND "participantKey" = $2`,
          dm.id,
          f.b,
        ),
      ).rejects.toThrow(/cannot move backwards/);
      await expect(
        exec(
          `UPDATE "ChatParticipant" SET "readSequence" = 99 WHERE "conversationId" = $1 AND "participantKey" = $2`,
          dm.id,
          f.b,
        ),
      ).rejects.toThrow(/cannot exceed/);
    });

    it('team cursor: bounded, monotonic and only for current members', async () => {
      const company = await createCompany('chat-db-cursor');
      const u = await createUser('cu', company);
      const outsider = await createUser('co', company, { isActive: false });
      const team = await createTeam(company);
      await sendRaw({
        conversationId: team,
        companyId: company,
        sender: u,
        team: true,
      });

      await expect(
        exec(
          `INSERT INTO "ChatTeamReadCursor" ("companyId","userKey","lastReadSequence","updatedAt") VALUES ($1,$2,5,now())`,
          company,
          u,
        ),
      ).rejects.toThrow(/exceeds its sequence/);

      await exec(
        `INSERT INTO "ChatTeamReadCursor" ("companyId","userKey","lastReadSequence","updatedAt") VALUES ($1,$2,1,now())`,
        company,
        u,
      );
      await expect(
        exec(
          `UPDATE "ChatTeamReadCursor" SET "lastReadSequence" = 0 WHERE "companyId" = $1 AND "userKey" = $2`,
          company,
          u,
        ),
      ).rejects.toThrow(/cannot move backwards/);
      await expect(
        exec(
          `INSERT INTO "ChatTeamReadCursor" ("companyId","userKey","lastReadSequence","updatedAt") VALUES ($1,$2,1,now())`,
          company,
          outsider,
        ),
      ).rejects.toThrow(/not currently eligible/);
    });
  });

  // -------------------------------------------------------------------
  describe('concurrency', () => {
    it('allocates unique, gap-free sequences under concurrent senders', async () => {
      const dm = await createDirect(f.companyA, f.a, f.b);

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          sendRaw({
            conversationId: dm.id,
            companyId: f.companyA,
            sender: i % 2 === 0 ? f.a : f.b,
            team: false,
          }),
        ),
      );

      const sequences = results.map((r) => r.sequence).sort((x, y) => x - y);
      expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

      const stored = await rows<{ n: bigint }>(
        `SELECT count(*) AS n FROM "ChatMessage" WHERE "conversationId" = $1`,
        dm.id,
      );
      expect(Number(stored[0].n)).toBe(20);
    });

    it('a membership change waits for an in-flight team send, so the audience boundary is unambiguous', async () => {
      const company = await createCompany('chat-db-race');
      const sender = await createUser('rs', company);
      const leaver = await createUser('rl', company);
      const team = await createTeam(company);

      let sendStartedResolve: () => void = () => undefined;
      const sendStarted = new Promise<void>((resolve) => {
        sendStartedResolve = resolve;
      });

      const send = prismaRaw().$transaction(async (tx) => {
        const e = await tx.$queryRawUnsafe<{ e: bigint }[]>(
          `SELECT "chatMembershipEpoch" AS e FROM "Company" WHERE id = $1 FOR SHARE`,
          company,
        );
        const epoch = Number(e[0].e);
        const seq = await tx.$queryRawUnsafe<{ n: bigint }[]>(
          `UPDATE "ChatConversation" SET "nextSequence" = "nextSequence" + 1 WHERE id = $1 RETURNING "nextSequence" AS n`,
          team,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "ChatMessage" ("id","conversationId","sequence","senderKey","senderId","senderName","clientMessageId","body","audienceEpoch")
           VALUES ($1,$2,$3,$4,$4,'S',$5,'x',$6)`,
          randomUUID(),
          team,
          BigInt(Number(seq[0].n)),
          sender,
          randomUUID(),
          BigInt(epoch),
        );
        sendStartedResolve();
        await new Promise((resolve) => setTimeout(resolve, 800));
        return epoch;
      });

      await sendStarted;
      const started = Date.now();
      await exec(`UPDATE "User" SET "isActive" = false WHERE id = $1`, leaver);
      const waited = Date.now() - started;

      const sentEpoch = await send;

      // The membership change could only run after the send committed...
      expect(waited).toBeGreaterThanOrEqual(500);
      // ...so it moved the company to a LATER epoch than the message holds,
      // and the leaver's interval closes strictly after the message epoch.
      expect(await epochOf(company)).toBeGreaterThan(sentEpoch);
      const closed = await rows<{ toEpoch: bigint }>(
        `SELECT "toEpoch" FROM "TeamMembershipInterval" WHERE "companyId" = $1 AND "userKey" = $2`,
        company,
        leaver,
      );
      expect(Number(closed[0].toEpoch)).toBeGreaterThan(sentEpoch);
    });
  });

  // -------------------------------------------------------------------
  describe('history retention', () => {
    it('keeps messages (and their sender snapshot) when a user is deactivated, soft-deleted or hard-deleted', async () => {
      const company = await createCompany('chat-db-retain');
      const keep = await createUser('keep', company);
      const gone = await createUser('gone', company);
      const dm = await createDirect(company, keep, gone);

      const sent = await sendRaw({
        conversationId: dm.id,
        companyId: company,
        sender: gone,
        team: false,
      });

      await exec(`UPDATE "User" SET "isActive" = false WHERE id = $1`, gone);
      await exec(`UPDATE "User" SET "deletedAt" = now() WHERE id = $1`, gone);
      await harness.prisma.user.delete({ where: { id: gone } });
      harness.forgetUser(gone); // already gone: keep the cleanup ledger truthful

      const m = await rows<{
        senderKey: string;
        senderId: string | null;
        senderName: string;
      }>(
        `SELECT "senderKey","senderId","senderName" FROM "ChatMessage" WHERE id = $1`,
        sent.id,
      );
      expect(m).toHaveLength(1);
      expect(m[0].senderKey).toBe(gone);
      expect(m[0].senderId).toBeNull();
      expect(m[0].senderName).toBe('Sender');

      const participants = await rows<{
        participantKey: string;
        userId: string | null;
      }>(
        `SELECT "participantKey","userId" FROM "ChatParticipant" WHERE "conversationId" = $1`,
        dm.id,
      );
      expect(participants).toHaveLength(2);
      expect(
        participants.find((p) => p.participantKey === gone)?.userId,
      ).toBeNull();
    });

    it('cannot hard-delete a company that has chat history', async () => {
      const company = await createCompany('chat-db-company');
      await createUser('cu1', company);
      await createTeam(company);

      await expect(
        exec(`DELETE FROM "Company" WHERE id = $1`, company),
      ).rejects.toThrow();
    });

    it('rejects deleting history rows without the explicit purge switch', async () => {
      const dm = await createDirect(f.companyA, f.a, f.b);
      await expect(
        exec(`DELETE FROM "ChatConversation" WHERE id = $1`, dm.id),
      ).rejects.toThrow(/cannot be deleted/);
    });
  });
});
