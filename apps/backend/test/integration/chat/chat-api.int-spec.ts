/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-base-to-string -- supertest response bodies and parsed WebSocket frames are untyped (`any`) by design */
/**
 * Team chat - REST API + WebSocket (integration).
 *
 * Real AppModule, real PostgreSQL test database (`orbitcrm_test` only, via
 * the shared harness guard) with the 20261011180000_add_team_chat migration,
 * a real HTTP listener and real `ws` client sockets.
 *
 * Authentication is exercised the way the application does it: an access
 * token signed by the application's own JwtService, sent in the existing
 * HttpOnly cookie, plus the existing CSRF double-submit pair on mutations.
 * Nothing in the auth system is bypassed or modified; chat has no RBAC
 * permission, so the fixture users deliberately have NO role.
 *
 * Handshake throttling is keyed by the right-most X-Forwarded-For entry, so
 * every socket here uses its own synthetic address (one test pins one
 * address on purpose to prove the limiter).
 *
 * Request budget (global ThrottlerGuard, in-memory, keyed by IP + route):
 * every route is used well below its limit; message sends total < 90.
 */
import type { Server } from 'http';
import type { AddressInfo } from 'net';

import cookieParser from 'cookie-parser';
import request from 'supertest';
import WebSocket from 'ws';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../../../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../../../src/common/interceptors/response.interceptor';
import { PrismaService } from '../../../src/infrastructure/prisma/prisma.service';
import { AppModule } from '../../../src/modules/app/app.module';
import { ChatPresenceService } from '../../../src/modules/chat/chat-presence.service';
import { ChatRealtimeServer } from '../../../src/modules/chat/realtime/chat-realtime.server';

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const ACCESS_COOKIE = 'orbit_access_token';
const CSRF_COOKIE = 'orbit_csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_VALUE = 'csrf-test-value';
const ORIGIN = 'http://localhost:5173'; // FRONTEND_URL of the test env

interface Actor {
  id: string;
  email: string;
  companyId: string;
}

interface Client {
  ws: WebSocket;
  events: Array<Record<string, any>>;
  closed: Promise<{ code: number; reason: string }>;
}

describe('Team chat REST + WebSocket (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;
  let port: number;
  let jwt: JwtService;
  let prisma: PrismaService;
  let realtime: ChatRealtimeServer;
  let presence: ChatPresenceService;

  let companyA: string;
  let companyB: string;
  let alice: Actor;
  let bob: Actor;
  let carol: Actor;
  let dave: Actor; // inactive from the start
  let eve: Actor; // company B

  let seq = 0;
  const sockets: WebSocket[] = [];

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  async function createCompany(label: string): Promise<string> {
    const company = await harness.prisma.company.create({
      data: { name: harness.uniqueName(`${label}-${(seq += 1)}`) },
      select: { id: true },
    });
    harness.registerCompany(company.id);
    return company.id;
  }

  async function createUser(
    label: string,
    companyId: string,
    options: { isActive?: boolean; session?: boolean } = {},
  ): Promise<Actor> {
    const email = harness.uniqueEmail(`${label}-${(seq += 1)}`);
    const user = await harness.prisma.user.create({
      data: {
        firstName: label,
        lastName: 'Chat',
        email,
        isEmailVerified: true,
        isActive: options.isActive ?? true,
        isOwner: false,
        companyId,
        roleId: null, // chat must not depend on RBAC
      },
      select: { id: true },
    });
    harness.registerUser(user.id);

    if (options.session !== false) {
      const session = await harness.prisma.authSession.create({
        data: {
          userId: user.id,
          tokenHash: `hash-${user.id}`,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
        select: { id: true },
      });
      harness.registerSession(session.id);
    }

    return { id: user.id, email, companyId };
  }

  const tokenFor = (actor: Actor, expiresIn: string | number = '15m'): string =>
    jwt.sign(
      {
        sub: actor.id,
        companyId: actor.companyId,
        email: actor.email,
        isOwner: false,
      },
      { expiresIn: expiresIn as never },
    );

  const get = (actor: Actor, path: string) =>
    request(httpServer)
      .get(path)
      .set('Cookie', [`${ACCESS_COOKIE}=${tokenFor(actor)}`]);

  const post = (actor: Actor, path: string, body: Record<string, unknown>) =>
    request(httpServer)
      .post(path)
      .set('Cookie', [
        `${ACCESS_COOKIE}=${tokenFor(actor)}`,
        `${CSRF_COOKIE}=${CSRF_VALUE}`,
      ])
      .set(CSRF_HEADER, CSRF_VALUE)
      .send(body);

  let uuidCounter = 0;
  const cid = (): string =>
    `c-${harness.runId.slice(0, 8)}-${(uuidCounter += 1).toString().padStart(6, '0')}`;

  async function teamId(actor: Actor): Promise<string> {
    const res = await get(actor, '/chat/conversations').expect(200);
    const team = res.body.data.find((c: { type: string }) => c.type === 'TEAM');
    return team.id as string;
  }

  async function directId(actor: Actor, peer: Actor): Promise<string> {
    const res = await post(actor, '/chat/conversations/direct', {
      userId: peer.id,
    }).expect(200);
    return res.body.data.id as string;
  }

  function send(
    actor: Actor,
    conversationId: string,
    body: string,
    clientMessageId = cid(),
  ) {
    return post(actor, `/chat/conversations/${conversationId}/messages`, {
      clientMessageId,
      body,
    });
  }

  let forwardedFor = 0;

  /** Opens a socket with its own synthetic client address. */
  function connect(
    actor: Actor,
    options: {
      origin?: string | null;
      cookie?: string | null;
      token?: string;
      forwarded?: string;
      path?: string;
    } = {},
  ): Promise<Client> {
    forwardedFor += 1;

    const headers: Record<string, string> = {
      'X-Forwarded-For':
        options.forwarded ??
        `10.7.${Math.floor(forwardedFor / 250)}.${forwardedFor % 250}`,
    };
    if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;

    const cookie =
      options.cookie === undefined
        ? `${ACCESS_COOKIE}=${options.token ?? tokenFor(actor)}`
        : options.cookie;
    if (cookie !== null) headers.Cookie = cookie;

    const ws = new WebSocket(
      `ws://127.0.0.1:${port}${options.path ?? '/chat/ws'}`,
      { headers },
    );
    sockets.push(ws);

    const events: Array<Record<string, any>> = [];
    ws.on('message', (data) => {
      try {
        events.push(JSON.parse(data.toString()));
      } catch {
        // ignore
      }
    });

    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) =>
        resolve({ code, reason: reason.toString() }),
      );
    });

    return new Promise((resolve, reject) => {
      ws.once('open', () => resolve({ ws, events, closed }));
      ws.once('unexpected-response', (_req, res) => {
        reject(new HandshakeRefused(res.statusCode ?? 0));
      });
      ws.once('error', (error) => {
        if (
          !(error instanceof Error) ||
          !/Unexpected server response/.test(error.message)
        ) {
          reject(error);
        }
      });
    });
  }

  class HandshakeRefused extends Error {
    constructor(readonly status: number) {
      super(`handshake refused: ${status}`);
    }
  }

  async function refusedStatus(promise: Promise<Client>): Promise<number> {
    try {
      const client = await promise;
      client.ws.terminate();
      return 101;
    } catch (error) {
      if (error instanceof HandshakeRefused) return error.status;
      throw error;
    }
  }

  async function eventually<T>(
    fn: () => T | Promise<T>,
    timeoutMs = 6000,
  ): Promise<NonNullable<T>> {
    const started = Date.now();
    let lastError: unknown;

    while (Date.now() - started < timeoutMs) {
      try {
        const value = await fn();
        if (value !== undefined && (value as unknown) !== false) {
          return value as NonNullable<T>;
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('eventually(): condition not met in time');
  }

  const waitEvent = (
    client: Client,
    predicate: (e: Record<string, any>) => boolean,
    timeoutMs = 6000,
  ) => eventually(() => client.events.find(predicate), timeoutMs);

  const eventsOf = (client: Client, type: string) =>
    client.events.filter((e) => e.type === type);

  const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

  // -------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.assertDatabaseIdentity();
    await harness.recoverOrphans();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(
      new PrismaExceptionFilter(),
      new HttpExceptionFilter(),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    await app.listen(0, '127.0.0.1');

    httpServer = app.getHttpServer() as Server;
    port = (httpServer.address() as AddressInfo).port;
    jwt = app.get(JwtService, { strict: false });
    prisma = app.get(PrismaService);
    realtime = app.get(ChatRealtimeServer);
    presence = app.get(ChatPresenceService);

    expect(process.env.NODE_ENV).toBe('test');

    companyA = await createCompany('chat-api-a');
    companyB = await createCompany('chat-api-b');

    alice = await createUser('alice', companyA);
    bob = await createUser('bob', companyA);
    carol = await createUser('carol', companyA);
    dave = await createUser('dave', companyA, { isActive: false });
    eve = await createUser('eve', companyB);
  });

  afterAll(async () => {
    for (const ws of sockets) {
      try {
        ws.terminate();
      } catch {
        // already closed
      }
    }

    try {
      if (app) await app.close();
    } finally {
      if (harness) {
        try {
          await harness.cleanup();
        } finally {
          await harness.close();
        }
      }
    }
  }, 120_000);

  // -------------------------------------------------------------------
  describe('authentication and CSRF (existing mechanisms, unchanged)', () => {
    it('401 without credentials', async () => {
      await request(httpServer).get('/chat/bootstrap').expect(401);
      await request(httpServer).get('/chat/conversations').expect(401);
    });

    it('401 for a garbage token', async () => {
      await request(httpServer)
        .get('/chat/session')
        .set('Cookie', [`${ACCESS_COOKIE}=not.a.jwt`])
        .expect(401);
    });

    it('mutations need the CSRF header (403 without it)', async () => {
      const team = await teamId(alice);

      await request(httpServer)
        .post(`/chat/conversations/${team}/messages`)
        .set('Cookie', [`${ACCESS_COOKIE}=${tokenFor(alice)}`])
        .send({ clientMessageId: cid(), body: 'no csrf' })
        .expect(403);

      await request(httpServer)
        .post(`/chat/conversations/${team}/messages`)
        .set('Cookie', [
          `${ACCESS_COOKIE}=${tokenFor(alice)}`,
          `${CSRF_COOKIE}=${CSRF_VALUE}`,
        ])
        .set(CSRF_HEADER, 'a-different-value')
        .send({ clientMessageId: cid(), body: 'wrong csrf' })
        .expect(403);
    });

    it('a deactivated user holding a valid token is rejected', async () => {
      await get(dave, '/chat/bootstrap').expect(401);
    });

    it('a user WITHOUT any role can use chat (chat is independent of RBAC)', async () => {
      const res = await get(bob, '/chat/session').expect(200);

      expect(res.body.data.me.id).toBe(bob.id);
      expect(res.body.data.me.companyId).toBe(companyA);
    });
  });

  // -------------------------------------------------------------------
  describe('bootstrap, teammates and tenant isolation', () => {
    it('bootstrap returns the TEAM conversation, own identity and teammates', async () => {
      const res = await get(alice, '/chat/bootstrap').expect(200);
      const data = res.body.data;

      expect(data.me).toMatchObject({ id: alice.id, companyId: companyA });
      expect(
        data.conversations.filter((c: any) => c.type === 'TEAM'),
      ).toHaveLength(1);

      const ids = data.teammates.map((t: any) => t.id).sort();
      expect(ids).toEqual([bob.id, carol.id].sort()); // not self, not dave, not eve
    });

    it('teammates never include another company or inactive users, and support search', async () => {
      const res = await get(alice, '/chat/teammates?search=bo').expect(200);
      expect(res.body.data.map((t: any) => t.id)).toEqual([bob.id]);

      const other = await get(eve, '/chat/teammates').expect(200);
      expect(other.body.data).toEqual([]);
    });

    it('each company gets its own team conversation', async () => {
      const a = await teamId(alice);
      const b = await teamId(eve);

      expect(a).not.toBe(b);
    });

    it("another tenant's conversation answers a uniform 404 for every operation", async () => {
      const team = await teamId(alice);

      await get(eve, `/chat/conversations/${team}/messages`).expect(404);
      await get(eve, `/chat/conversations/${team}/receipts?from=1&to=2`).expect(
        404,
      );
      await send(eve, team, 'intrusion').expect(404);
      await post(eve, `/chat/conversations/${team}/read`, {
        upToSequence: 1,
      }).expect(404);

      // Unknown ids look exactly the same: nothing to enumerate.
      const unknown = await get(
        eve,
        '/chat/conversations/clmissing0000000000000000/messages',
      );
      expect(unknown.status).toBe(404);
    });

    it('cannot open a direct conversation with a user of another company or an inactive one', async () => {
      await post(alice, '/chat/conversations/direct', {
        userId: eve.id,
      }).expect(404);
      await post(alice, '/chat/conversations/direct', {
        userId: dave.id,
      }).expect(404);
      await post(alice, '/chat/conversations/direct', {
        userId: alice.id,
      }).expect(400);
      await post(alice, '/chat/conversations/direct', {
        userId: 'x'.repeat(65),
      }).expect(400);
    });

    it('a third person cannot read or write into a direct conversation', async () => {
      const dm = await directId(alice, bob);

      await send(carol, dm, 'eavesdrop').expect(404);
      await get(carol, `/chat/conversations/${dm}/messages`).expect(404);
      await post(carol, `/chat/conversations/${dm}/read`, {
        upToSequence: 1,
      }).expect(404);
    });

    it('opening the same pair from either side returns the same conversation', async () => {
      const first = await directId(alice, bob);
      const second = await directId(bob, alice);

      expect(second).toBe(first);
    });

    it('rejects malformed input: ids, bodies, identities smuggled by the client', async () => {
      const team = await teamId(alice);

      await get(alice, '/chat/conversations/a%20b/messages').expect(400);
      await send(alice, team, '').expect(400);
      await send(alice, team, '   ').expect(400);
      await send(alice, team, 'x'.repeat(4001)).expect(400);
      await post(alice, `/chat/conversations/${team}/messages`, {
        clientMessageId: cid(),
        body: 'hi',
        senderId: bob.id,
      }).expect(400);
      await post(alice, `/chat/conversations/${team}/messages`, {
        clientMessageId: 'bad id!',
        body: 'hi',
      }).expect(400);
      await get(alice, `/chat/conversations/${team}/messages?limit=999`).expect(
        400,
      );
      await get(
        alice,
        `/chat/conversations/${team}/messages?before=5&after=1`,
      ).expect(400);
      await post(alice, `/chat/conversations/${team}/read`, {
        upToSequence: 0,
      }).expect(400);
    });
  });

  // -------------------------------------------------------------------
  describe('messages: persistence, ordering, idempotency, pagination', () => {
    it('persists with a server-derived sender and company, in order', async () => {
      const dm = await directId(alice, carol);

      const m1 = await send(alice, dm, '  first  ').expect(201);
      const m2 = await send(carol, dm, 'second').expect(201);

      expect(m1.body.data.duplicate).toBe(false);
      expect(m1.body.data.message).toMatchObject({
        sequence: 1,
        senderId: alice.id,
        senderName: 'alice Chat',
        body: 'first', // normalised
      });
      expect(m2.body.data.message.sequence).toBe(2);

      const history = await get(
        alice,
        `/chat/conversations/${dm}/messages`,
      ).expect(200);
      expect(history.body.data.messages.map((m: any) => m.sequence)).toEqual([
        1, 2,
      ]);
      expect(history.body.data.lastSequence).toBe(2);

      const stored = await prisma.$queryRaw<
        Array<{ audienceEpoch: bigint | null; senderKey: string }>
      >`
        SELECT "audienceEpoch", "senderKey" FROM "ChatMessage" WHERE id = ${m1.body.data.message.id}`;
      expect(stored[0].senderKey).toBe(alice.id);
      expect(stored[0].audienceEpoch).toBeNull(); // direct: no team epoch
    });

    it('is idempotent: a retry returns the stored message and does not duplicate it', async () => {
      const dm = await directId(bob, carol);
      const clientMessageId = cid();

      const first = await send(bob, dm, 'once', clientMessageId).expect(201);
      const retry = await send(bob, dm, 'once', clientMessageId).expect(201);

      expect(first.body.data.duplicate).toBe(false);
      expect(retry.body.data.duplicate).toBe(true);
      expect(retry.body.data.message.id).toBe(first.body.data.message.id);

      const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM "ChatMessage" WHERE "conversationId" = ${dm}`;
      expect(Number(rows[0].n)).toBe(1);
    });

    it('reusing a clientMessageId for different content is a 409', async () => {
      const dm = await directId(bob, carol);
      const clientMessageId = cid();

      await send(bob, dm, 'original', clientMessageId).expect(201);
      await send(bob, dm, 'tampered', clientMessageId).expect(409);
    });

    it('the same clientMessageId from different senders is NOT a collision', async () => {
      const team = await teamId(alice);
      const shared = cid();

      const a = await send(alice, team, 'from alice', shared).expect(201);
      const b = await send(bob, team, 'from bob', shared).expect(201);

      expect(a.body.data.message.id).not.toBe(b.body.data.message.id);
    });

    it('concurrent sends get unique, gap-free sequences', async () => {
      const dm = await directId(alice, bob);

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          send(i % 2 === 0 ? alice : bob, dm, `parallel ${i}`),
        ),
      );

      expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));

      const sequences = results
        .map((r) => r.body.data.message.sequence as number)
        .sort((x, y) => x - y);

      expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });

    it('concurrent retries of ONE clientMessageId store exactly one message', async () => {
      const dm = await directId(alice, carol);
      const clientMessageId = cid();

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          send(alice, dm, 'race', clientMessageId),
        ),
      );

      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.data.message.id)).size).toBe(1);
      expect(
        results.filter((r) => r.body.data.duplicate === false),
      ).toHaveLength(1);

      const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM "ChatMessage"
        WHERE "conversationId" = ${dm} AND "clientMessageId" = ${clientMessageId}`;
      expect(Number(rows[0].n)).toBe(1);
    });

    it('paginates older pages and recovers newer ones by sequence cursor', async () => {
      const dm = await directId(bob, carol);
      const existing = await get(
        bob,
        `/chat/conversations/${dm}/messages?limit=50`,
      ).expect(200);
      const base = existing.body.data.messages.length as number;

      for (let i = 0; i < 5; i += 1) {
        await send(bob, dm, `page ${i}`).expect(201);
      }

      const total = base + 5;
      const newest = await get(
        bob,
        `/chat/conversations/${dm}/messages?limit=2`,
      ).expect(200);
      expect(newest.body.data.messages.map((m: any) => m.sequence)).toEqual([
        total - 1,
        total,
      ]);
      expect(newest.body.data.hasMore).toBe(true);

      const older = await get(
        bob,
        `/chat/conversations/${dm}/messages?limit=2&before=${total - 1}`,
      ).expect(200);
      expect(older.body.data.messages.map((m: any) => m.sequence)).toEqual([
        total - 3,
        total - 2,
      ]);

      const recovery = await get(
        bob,
        `/chat/conversations/${dm}/messages?limit=50&after=${total - 2}`,
      ).expect(200);
      expect(recovery.body.data.messages.map((m: any) => m.sequence)).toEqual([
        total - 1,
        total,
      ]);
      expect(recovery.body.data.hasMore).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  describe('read receipts (server-validated)', () => {
    it('direct: one check when persisted, two once the recipient acknowledged visibility', async () => {
      const dm = await directId(alice, carol);
      const sent = await send(alice, dm, 'receipt me').expect(201);
      const sequence = sent.body.data.message.sequence as number;

      expect(sent.body.data.message.receipt).toEqual({
        readCount: 0,
        recipientCount: 1,
      });

      // The recipient's own view of the message carries no receipt.
      const peerView = await get(
        carol,
        `/chat/conversations/${dm}/messages`,
      ).expect(200);
      expect(peerView.body.data.messages.at(-1).receipt).toBeNull();

      const read = await post(carol, `/chat/conversations/${dm}/read`, {
        upToSequence: sequence,
      }).expect(200);
      expect(read.body.data.readSequence).toBe(sequence);
      expect(read.body.data.unreadCount).toBe(0);

      const receipts = await get(
        alice,
        `/chat/conversations/${dm}/receipts?from=${sequence}&to=${sequence}`,
      ).expect(200);
      expect(receipts.body.data.receipts).toEqual([
        {
          id: sent.body.data.message.id,
          sequence,
          readCount: 1,
          recipientCount: 1,
        },
      ]);
    });

    it('the read cursor is clamped to the conversation and never moves backwards', async () => {
      const dm = await directId(bob, carol);
      const sent = await send(bob, dm, 'clamp').expect(201);
      const last = sent.body.data.message.sequence as number;

      const beyond = await post(carol, `/chat/conversations/${dm}/read`, {
        upToSequence: last + 1000,
      }).expect(200);
      expect(beyond.body.data.readSequence).toBe(last);

      const backwards = await post(carol, `/chat/conversations/${dm}/read`, {
        upToSequence: 1,
      }).expect(200);
      expect(backwards.body.data.readSequence).toBe(last);
    });

    it('a sender cannot acknowledge their own message on behalf of the recipient', async () => {
      const dm = await directId(bob, carol);
      const sent = await send(bob, dm, 'self-ack').expect(201);

      await post(bob, `/chat/conversations/${dm}/read`, {
        upToSequence: sent.body.data.message.sequence,
      }).expect(200);

      const mine = await get(
        bob,
        `/chat/conversations/${dm}/messages?limit=1`,
      ).expect(200);
      expect(mine.body.data.messages[0].receipt.readCount).toBe(0);
    });

    it('team: recipients are the historical audience (members only), counted as they read', async () => {
      const company = await createCompany('chat-api-team-receipts');
      const s = await createUser('sender', company);
      const r1 = await createUser('reader1', company);
      const r2 = await createUser('reader2', company);
      await createUser('inactive', company, { isActive: false });

      const team = await teamId(s);
      const sent = await send(s, team, 'to everyone').expect(201);
      const sequence = sent.body.data.message.sequence as number;

      expect(sent.body.data.message.receipt).toEqual({
        readCount: 0,
        recipientCount: 2,
      });

      await post(r1, `/chat/conversations/${team}/read`, {
        upToSequence: sequence,
      }).expect(200);
      let history = await get(s, `/chat/conversations/${team}/messages`).expect(
        200,
      );
      expect(history.body.data.messages[0].receipt).toEqual({
        readCount: 1,
        recipientCount: 2,
      });

      await post(r2, `/chat/conversations/${team}/read`, {
        upToSequence: sequence,
      }).expect(200);
      history = await get(s, `/chat/conversations/${team}/messages`).expect(
        200,
      );
      expect(history.body.data.messages[0].receipt).toEqual({
        readCount: 2,
        recipientCount: 2,
      });
    });
  });

  // -------------------------------------------------------------------
  describe('historical audience and membership changes', () => {
    it('a later joiner never sees earlier team messages; a leaver keeps what they received', async () => {
      const company = await createCompany('chat-api-audience');
      const first = await createUser('first', company);
      const leaver = await createUser('leaver', company);

      const team = await teamId(first);
      await send(first, team, 'before the joiner').expect(201);

      const joiner = await createUser('joiner', company);
      const afterJoin = await send(first, team, 'after the joiner').expect(201);

      const joinerHistory = await get(
        joiner,
        `/chat/conversations/${team}/messages`,
      ).expect(200);
      expect(joinerHistory.body.data.messages.map((m: any) => m.body)).toEqual([
        'after the joiner',
      ]);

      // The sender's receipt for the OLD message now counts only people who
      // were recipients then AND are still members: leaver + (not joiner).
      const history = await get(
        first,
        `/chat/conversations/${team}/messages`,
      ).expect(200);
      const old = history.body.data.messages.find(
        (m: any) => m.body === 'before the joiner',
      );
      expect(old.receipt.recipientCount).toBe(1);

      const recent = history.body.data.messages.find(
        (m: any) => m.id === afterJoin.body.data.message.id,
      );
      expect(recent.receipt.recipientCount).toBe(2);

      // The leaver is deactivated: the next request is refused ...
      await harness.prisma.user.update({
        where: { id: leaver.id },
        data: { isActive: false },
      });
      await get(leaver, `/chat/conversations/${team}/messages`).expect(401);

      // ... and the sender's receipts stop waiting for someone who left.
      const afterLeave = await get(
        first,
        `/chat/conversations/${team}/messages`,
      ).expect(200);
      const stillOld = afterLeave.body.data.messages.find(
        (m: any) => m.body === 'before the joiner',
      );
      expect(stillOld.receipt.recipientCount).toBe(0);

      // While deactivated the leaver is not part of the audience of new
      // messages; after reactivation they see what they were a recipient of
      // (including the messages sent BEFORE they left) but never the ones
      // sent while they were away.
      await send(first, team, 'while the leaver was away').expect(201);
      await harness.prisma.user.update({
        where: { id: leaver.id },
        data: { isActive: true },
      });

      const back = await get(
        leaver,
        `/chat/conversations/${team}/messages`,
      ).expect(200);
      expect(back.body.data.messages.map((m: any) => m.body)).toEqual([
        'before the joiner',
        'after the joiner',
      ]);
    });

    it('a user moved to another company loses access to the old conversations at once', async () => {
      const from = await createCompany('chat-api-move-from');
      const to = await createCompany('chat-api-move-to');
      const peer = await createUser('stay', from);
      const mover = await createUser('mover', from);

      const oldTeam = await teamId(peer);
      const oldDirect = await directId(peer, mover);
      await send(mover, oldDirect, 'before moving').expect(201);

      await harness.prisma.user.update({
        where: { id: mover.id },
        data: { companyId: to },
      });

      // Same (still valid) token, now resolved against the NEW company.
      await get(mover, `/chat/conversations/${oldTeam}/messages`).expect(404);
      await get(mover, `/chat/conversations/${oldDirect}/messages`).expect(404);
      await send(mover, oldDirect, 'after moving').expect(404);

      const me = await get(mover, '/chat/session').expect(200);
      expect(me.body.data.me.companyId).toBe(to);
    });

    it('sending to a deactivated peer is refused; history stays readable', async () => {
      const company = await createCompany('chat-api-peer-off');
      const a = await createUser('pa', company);
      const b = await createUser('pb', company);

      const dm = await directId(a, b);
      await send(a, dm, 'hello').expect(201);

      await harness.prisma.user.update({
        where: { id: b.id },
        data: { isActive: false },
      });

      await send(a, dm, 'are you there?').expect(403);

      const history = await get(a, `/chat/conversations/${dm}/messages`).expect(
        200,
      );
      expect(history.body.data.messages).toHaveLength(1);

      const list = await get(a, '/chat/conversations').expect(200);
      const item = list.body.data.find((c: any) => c.id === dm);
      expect(item.canSend).toBe(false);
      expect(item.peer.eligible).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  describe('WebSocket handshake', () => {
    it('accepts a valid cookie from the allowed origin and says ready', async () => {
      const client = await connect(alice);
      const ready = await waitEvent(client, (e) => e.type === 'ready');

      expect(ready.connectionId).toEqual(expect.any(String));
      expect(ready.heartbeatMs).toBeGreaterThan(0);
      client.ws.close();
    });

    it('refuses: no cookie, bad token, expired token, token in the URL', async () => {
      expect(await refusedStatus(connect(alice, { cookie: null }))).toBe(401);
      expect(await refusedStatus(connect(alice, { token: 'garbage' }))).toBe(
        401,
      );
      expect(
        await refusedStatus(connect(alice, { token: tokenFor(alice, -30) })),
      ).toBe(401);

      // A token in the query string must never be honoured.
      expect(
        await refusedStatus(
          connect(alice, {
            cookie: null,
            path: `/chat/ws?access_token=${tokenFor(alice)}`,
          }),
        ),
      ).toBe(401);
    });

    it('refuses a foreign or missing Origin even with a perfectly valid cookie (CSWSH)', async () => {
      expect(
        await refusedStatus(connect(alice, { origin: 'https://evil.example' })),
      ).toBe(403);
      expect(
        await refusedStatus(
          connect(alice, { origin: 'http://localhost:5173.evil.example' }),
        ),
      ).toBe(403);
      expect(await refusedStatus(connect(alice, { origin: null }))).toBe(403);
    });

    it('refuses an ineligible user and a user without any live session', async () => {
      expect(await refusedStatus(connect(dave))).toBe(403);

      const noSession = await createUser('nosession', companyA, {
        session: false,
      });
      expect(await refusedStatus(connect(noSession))).toBe(401);
    });

    it('throttles handshakes per client address', async () => {
      const results: number[] = [];
      for (let i = 0; i < 32; i += 1) {
        results.push(
          await refusedStatus(
            connect(alice, { cookie: null, forwarded: '203.0.113.9' }),
          ),
        );
      }

      expect(results.slice(0, 30).every((s) => s === 401)).toBe(true);
      expect(results.slice(30)).toEqual([429, 429]);
    });

    it('caps concurrent sockets per user', async () => {
      const company = await createCompany('chat-api-cap');
      const user = await createUser('capped', company);

      const open: Client[] = [];
      for (let i = 0; i < 10; i += 1) open.push(await connect(user));
      await Promise.all(
        open.map((c) => waitEvent(c, (e) => e.type === 'ready')),
      );

      expect(await refusedStatus(connect(user))).toBe(429);

      open.forEach((c) => c.ws.close());
    });
  });

  // -------------------------------------------------------------------
  describe('WebSocket delivery scoping', () => {
    it('team messages reach the company only; direct messages reach the two participants only', async () => {
      const [a, b, c, e] = await Promise.all([
        connect(alice),
        connect(bob),
        connect(carol),
        connect(eve),
      ]);
      await Promise.all(
        [a, b, c, e].map((x) => waitEvent(x, (ev) => ev.type === 'ready')),
      );

      const team = await teamId(alice);
      await send(alice, team, 'team broadcast').expect(201);

      await waitEvent(
        b,
        (ev) =>
          ev.type === 'message.new' && ev.message.body === 'team broadcast',
      );
      await waitEvent(
        c,
        (ev) =>
          ev.type === 'message.new' && ev.message.body === 'team broadcast',
      );
      await waitEvent(
        a,
        (ev) =>
          ev.type === 'message.new' && ev.message.body === 'team broadcast',
      );

      const dm = await directId(alice, bob);
      await send(alice, dm, 'private to bob').expect(201);

      await waitEvent(
        b,
        (ev) =>
          ev.type === 'message.new' && ev.message.body === 'private to bob',
      );
      await settle();

      const leaked = (client: Client) =>
        eventsOf(client, 'message.new').some((ev) =>
          ['team broadcast', 'private to bob'].includes(ev.message.body),
        );

      expect(leaked(e)).toBe(false); // other company: nothing at all
      expect(
        eventsOf(c, 'message.new').some(
          (ev) => ev.message.body === 'private to bob',
        ),
      ).toBe(false); // same company, not a participant

      [a, b, c, e].forEach((x) => x.ws.close());
    });

    it('a duplicate (retried) send is not published a second time', async () => {
      const [a, b] = await Promise.all([connect(alice), connect(bob)]);
      await Promise.all(
        [a, b].map((x) => waitEvent(x, (ev) => ev.type === 'ready')),
      );

      const dm = await directId(alice, bob);
      const clientMessageId = cid();

      await send(alice, dm, 'only once please', clientMessageId).expect(201);
      await send(alice, dm, 'only once please', clientMessageId).expect(201);
      await settle(500);

      expect(
        eventsOf(b, 'message.new').filter(
          (ev) => ev.message.body === 'only once please',
        ),
      ).toHaveLength(1);

      [a, b].forEach((x) => x.ws.close());
    });

    it('read acknowledgements are pushed to the sender', async () => {
      const [a, b] = await Promise.all([connect(alice), connect(bob)]);
      await Promise.all(
        [a, b].map((x) => waitEvent(x, (ev) => ev.type === 'ready')),
      );

      const dm = await directId(alice, bob);
      const sent = await send(alice, dm, 'tick me').expect(201);
      const sequence = sent.body.data.message.sequence as number;

      await post(bob, `/chat/conversations/${dm}/read`, {
        upToSequence: sequence,
      }).expect(200);

      const update = await waitEvent(
        a,
        (ev) => ev.type === 'read.updated' && ev.conversationId === dm,
      );
      expect(update).toMatchObject({
        readerId: bob.id,
        upToSequence: sequence,
      });

      [a, b].forEach((x) => x.ws.close());
    });

    it('a member who has left receives no live copy of new team messages', async () => {
      const company = await createCompany('chat-api-live-leave');
      const sender = await createUser('ls', company);
      const leaver = await createUser('ll', company);
      const stayer = await createUser('lt', company);

      const [s, l, t] = await Promise.all([
        connect(sender),
        connect(leaver),
        connect(stayer),
      ]);
      await Promise.all(
        [s, l, t].map((x) => waitEvent(x, (ev) => ev.type === 'ready')),
      );

      await harness.prisma.user.update({
        where: { id: leaver.id },
        data: { isActive: false },
      });

      const team = await teamId(sender);
      await send(sender, team, 'after the leaver left').expect(201);

      await waitEvent(
        t,
        (ev) =>
          ev.type === 'message.new' &&
          ev.message.body === 'after the leaver left',
      );
      await settle();
      expect(eventsOf(l, 'message.new')).toHaveLength(0);

      [s, l, t].forEach((x) => x.ws.close());
    });

    it('only heartbeats are accepted from a client; everything else is refused', async () => {
      const client = await connect(alice);
      await waitEvent(client, (e) => e.type === 'ready');

      client.ws.send(JSON.stringify({ type: 'ping' }));
      await waitEvent(client, (e) => e.type === 'pong');

      client.ws.send(JSON.stringify({ type: 'send', body: 'sneaky' }));
      await waitEvent(
        client,
        (e) => e.type === 'error' && e.code === 'unsupported_event',
      );

      client.ws.send('not json');
      await waitEvent(
        client,
        (e) => e.type === 'error' && e.code === 'invalid_frame',
      );

      // Persisting through the socket is impossible: nothing was stored.
      const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM "ChatMessage" WHERE body = 'sneaky'`;
      expect(Number(rows[0].n)).toBe(0);

      // Too many invalid frames: closed with a policy violation.
      for (let i = 0; i < 6; i += 1)
        client.ws.send(JSON.stringify({ type: 'join', room: 'x' }));
      const closed = await client.closed;
      expect(closed.code).toBe(1008);
    });

    it('closes oversized frames', async () => {
      const client = await connect(alice);
      await waitEvent(client, (e) => e.type === 'ready');

      client.ws.send('x'.repeat(5000));

      expect((await client.closed).code).toBe(1009);
    });
  });

  // -------------------------------------------------------------------
  describe('WebSocket revocation (revalidation tick)', () => {
    it('closes with 4403 when the user stops being eligible', async () => {
      const company = await createCompany('chat-api-rev-user');
      const user = await createUser('revoked', company);

      const client = await connect(user);
      await waitEvent(client, (e) => e.type === 'ready');

      await harness.prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });
      await realtime.tick();

      expect((await client.closed).code).toBe(4403);
    });

    it('closes with 4403 when the company is deactivated', async () => {
      const company = await createCompany('chat-api-rev-company');
      const user = await createUser('victim', company);

      const client = await connect(user);
      await waitEvent(client, (e) => e.type === 'ready');

      await harness.prisma.company.update({
        where: { id: company },
        data: { isActive: false },
      });
      await realtime.tick();

      expect((await client.closed).code).toBe(4403);
    });

    it('closes with 4403 when the user moves to another company', async () => {
      const from = await createCompany('chat-api-rev-from');
      const to = await createCompany('chat-api-rev-to');
      const user = await createUser('relocated', from);

      const client = await connect(user);
      await waitEvent(client, (e) => e.type === 'ready');

      await harness.prisma.user.update({
        where: { id: user.id },
        data: { companyId: to },
      });
      await realtime.tick();

      expect((await client.closed).code).toBe(4403);
    });

    it('closes with 4402 when ALL sessions are revoked, but not while one is alive', async () => {
      const company = await createCompany('chat-api-rev-session');
      const user = await createUser('sessions', company);
      const extra = await harness.prisma.authSession.create({
        data: {
          userId: user.id,
          tokenHash: `extra-${user.id}`,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
        select: { id: true },
      });
      harness.registerSession(extra.id);

      const client = await connect(user);
      await waitEvent(client, (e) => e.type === 'ready');

      // One of two sessions revoked: the connection stays (documented limit).
      await harness.prisma.authSession.update({
        where: { id: extra.id },
        data: { revokedAt: new Date() },
      });
      await realtime.tick();
      await settle(200);
      expect(client.ws.readyState).toBe(WebSocket.OPEN);

      // The last live session revoked: closed on the next tick.
      await harness.prisma.authSession.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
      });
      await realtime.tick();

      expect((await client.closed).code).toBe(4402);
    });

    it('closes with 4401 once the access token has expired', async () => {
      const company = await createCompany('chat-api-rev-exp');
      const user = await createUser('expiring', company);

      const client = await connect(user, { token: tokenFor(user, 2) });
      await waitEvent(client, (e) => e.type === 'ready');

      await settle(2300);
      await realtime.tick();

      expect((await client.closed).code).toBe(4401);
    });

    it('a still-eligible user is left alone by the tick', async () => {
      const client = await connect(alice);
      await waitEvent(client, (e) => e.type === 'ready');

      await realtime.tick();
      await settle(200);

      expect(client.ws.readyState).toBe(WebSocket.OPEN);
      client.ws.close();
    });
  });

  // -------------------------------------------------------------------
  describe('presence', () => {
    // Polling goes straight to the presence service (the REST route has a
    // per-minute throttle); the REST view is asserted explicitly below.
    const presenceOf = async (_viewer: Actor, subject: Actor) => {
      const map = await presence.getPresence(subject.companyId, [subject.id]);
      return map.get(subject.id) as {
        online: boolean;
        lastSeenAt: string | null;
      };
    };

    it('is online while ANY tab/device is connected and offline (with last seen) after the last one', async () => {
      const company = await createCompany('chat-api-presence');
      const watcher = await createUser('watcher', company);
      const subject = await createUser('subject', company);

      expect((await presenceOf(watcher, subject)).online).toBe(false);

      const watching = await connect(watcher);
      await waitEvent(watching, (e) => e.type === 'ready');

      const tab1 = await connect(subject);
      const tab2 = await connect(subject);
      await Promise.all(
        [tab1, tab2].map((t) => waitEvent(t, (e) => e.type === 'ready')),
      );

      await eventually(async () => (await presenceOf(watcher, subject)).online);

      const viaRest = await get(watcher, '/chat/teammates').expect(200);
      expect(
        viaRest.body.data.find((t: any) => t.id === subject.id),
      ).toMatchObject({
        online: true,
        lastSeenAt: null,
      });
      await waitEvent(
        watching,
        (e) =>
          e.type === 'presence.update' &&
          e.userId === subject.id &&
          e.online === true,
      );

      // Only ONE presence.update(online) for two tabs.
      await settle(300);
      expect(
        eventsOf(watching, 'presence.update').filter(
          (e) => e.userId === subject.id && e.online,
        ),
      ).toHaveLength(1);

      // Closing one tab leaves the user online.
      tab1.ws.close();
      await tab1.closed;
      await settle(300);
      expect((await presenceOf(watcher, subject)).online).toBe(true);

      // Closing the last one: leases are shortened (grace); expire them and
      // let the sweeper finalise the transition.
      tab2.ws.close();
      await tab2.closed;
      await settle(300);
      await prisma.$executeRaw`
        UPDATE "ChatPresenceLease"
        SET "lastHeartbeat" = (now() AT TIME ZONE 'UTC') - interval '2 seconds',
            "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 second'
        WHERE "companyId" = ${company} AND "userKey" = ${subject.id}`;
      // The sweeper is global: it also finalises any other expired lease that
      // is lying around in the shared test database, so only a lower bound
      // is meaningful here; the user's own transition is asserted below.
      expect(await presence.sweep()).toBeGreaterThanOrEqual(1);

      const after = await presenceOf(watcher, subject);
      expect(after.online).toBe(false);
      expect(after.lastSeenAt).toEqual(expect.any(String));

      const offline = await waitEvent(
        watching,
        (e) =>
          e.type === 'presence.update' &&
          e.userId === subject.id &&
          e.online === false,
      );
      expect(offline.lastSeenAt).toBe(after.lastSeenAt);

      watching.ws.close();
    });

    it('does not leak presence across companies', async () => {
      const online = await connect(alice);
      const other = await connect(eve);
      await Promise.all(
        [online, other].map((c) => waitEvent(c, (e) => e.type === 'ready')),
      );
      await settle(300);

      expect(
        eventsOf(other, 'presence.update').some((e) => e.userId === alice.id),
      ).toBe(false);

      [online, other].forEach((c) => c.ws.close());
    });

    it('an abandoned connection stops counting as online when its lease expires', async () => {
      const company = await createCompany('chat-api-lease');
      const watcher = await createUser('lw', company);
      const ghost = await createUser('ghost', company);

      const client = await connect(ghost);
      await waitEvent(client, (e) => e.type === 'ready');
      await eventually(async () => (await presenceOf(watcher, ghost)).online);

      // Simulate a crash: the lease is never renewed or released.
      client.ws.terminate();
      await prisma.$executeRaw`
        UPDATE "ChatPresenceLease"
        SET "lastHeartbeat" = (now() AT TIME ZONE 'UTC') - interval '2 seconds',
            "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 second'
        WHERE "companyId" = ${company} AND "userKey" = ${ghost.id}`;

      expect((await presenceOf(watcher, ghost)).online).toBe(false); // expired lease never counts
      await presence.sweep();
      expect((await presenceOf(watcher, ghost)).lastSeenAt).toEqual(
        expect.any(String),
      );
    });
  });

  // -------------------------------------------------------------------
  // Keep these LAST: they deliberately exhaust a per-route / per-socket
  // budget (route buckets are independent, so other routes are unaffected).
  describe('rate limits', () => {
    it('throttles a REST route per client (429) without affecting other routes', async () => {
      // `/chat/session` allows 60 requests per minute per client; earlier
      // tests already spent a few, so count what is left instead of
      // assuming a fresh bucket.
      let ok = 0;
      let firstRefusal = 0;

      for (let i = 1; i <= 70; i += 1) {
        const { status } = await get(alice, '/chat/session');
        if (status === 200) ok += 1;
        if (status === 429) {
          firstRefusal = i;
          break;
        }
      }

      expect(firstRefusal).toBeGreaterThan(0);
      expect(ok).toBeGreaterThan(50);
      expect(ok).toBeLessThanOrEqual(60);

      // A different route keeps working.
      await get(alice, '/chat/conversations').expect(200);
    });

    it('closes a socket that floods frames (policy violation)', async () => {
      const client = await connect(alice);
      await waitEvent(client, (e) => e.type === 'ready');

      for (let i = 0; i < 25; i += 1)
        client.ws.send(JSON.stringify({ type: 'ping' }));

      expect((await client.closed).code).toBe(1008);
    });
  });
});
