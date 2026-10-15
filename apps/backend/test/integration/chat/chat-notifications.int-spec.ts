/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- supertest response bodies and Json columns are untyped (`any`) by design */
/**
 * Team chat <-> Notifications (integration).
 *
 * Real AppModule, real PostgreSQL test database (`orbitcrm_test` only, via
 * the shared harness guard), real HTTP listener. Authentication works the
 * way the application does it (access token cookie + CSRF double submit);
 * nothing in auth is bypassed.
 *
 * Only the OUTBOUND push transport is replaced (a recording fake for
 * WebPushService): no network call is ever made. The notification worker
 * is not started by the application under NODE_ENV=test; the tests drive
 * `NotificationWorker.tick()` themselves with an injected clock.
 *
 * Budget (global in-memory throttler, per IP + route): message sends total
 * well below the 90/min limit of the route.
 */
import type { Server } from 'http';

import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../../../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../../../src/common/interceptors/response.interceptor';
import { PrismaService } from '../../../src/infrastructure/prisma/prisma.service';
import { AppModule } from '../../../src/modules/app/app.module';
import { ChatService } from '../../../src/modules/chat/chat.service';
import { NOTIFICATION_REPOSITORY } from '../../../src/modules/notification/constants/notification.constants';
import { NotificationService } from '../../../src/modules/notification/notification.service';
import { NotificationWorker } from '../../../src/modules/notification/notification.worker';
import type { INotificationRepository } from '../../../src/modules/notification/repository/notification.repository.interface';
import {
  PushSendError,
  WebPushService,
} from '../../../src/modules/notification/web-push.service';

import { createTestHarness } from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';

const ACCESS_COOKIE = 'orbit_access_token';
const CSRF_COOKIE = 'orbit_csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_VALUE = 'csrf-test-value';

interface Actor {
  id: string;
  email: string;
  companyId: string;
}

/** Recording stand-in for the outbound web-push transport (no network). */
const fakePush = {
  configured: true,
  failWith: null as PushSendError | null,
  sent: [] as Array<{ target: any; payload: any }>,
  isConfigured(): boolean {
    return this.configured;
  },
  getPublicKey(): string | null {
    return this.configured ? 'test-public-key' : null;
  },
  send(target: unknown, payload: unknown): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- failWith is always a PushSendError (an Error subclass); the rule cannot see through `this`
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push({ target, payload });
    return Promise.resolve();
  },
};

describe('Team chat -> Notifications (integration)', () => {
  let harness: TestHarness;
  let app: INestApplication | undefined;
  let httpServer: Server;
  let jwt: JwtService;
  let prisma: PrismaService;
  let chat: ChatService;
  let notifications: NotificationService;
  let worker: NotificationWorker;
  let repo: INotificationRepository;

  let seq = 0;
  let uuidCounter = 0;

  const savedEnv: Record<string, string | undefined> = {};

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
    options: { isActive?: boolean; language?: string } = {},
  ): Promise<Actor> {
    const email = harness.uniqueEmail(`${label}-${(seq += 1)}`);
    const user = await harness.prisma.user.create({
      data: {
        firstName: label,
        lastName: 'Notif',
        email,
        isEmailVerified: true,
        isActive: options.isActive ?? true,
        isOwner: false,
        companyId,
        roleId: null,
        ...(options.language && { language: options.language }),
      },
      select: { id: true },
    });
    harness.registerUser(user.id);

    const session = await harness.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: `hash-${user.id}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });
    harness.registerSession(session.id);

    return { id: user.id, email, companyId };
  }

  const tokenFor = (actor: Actor): string =>
    jwt.sign(
      {
        sub: actor.id,
        companyId: actor.companyId,
        email: actor.email,
        isOwner: false,
      },
      { expiresIn: '15m' as never },
    );

  const get = (actor: Actor, path: string) =>
    request(httpServer)
      .get(path)
      .set('Cookie', [`${ACCESS_COOKIE}=${tokenFor(actor)}`]);

  const mutate = (
    method: 'post' | 'patch',
    actor: Actor,
    path: string,
    body: Record<string, unknown> = {},
  ) =>
    request(httpServer)
      [method](path)
      .set('Cookie', [
        `${ACCESS_COOKIE}=${tokenFor(actor)}`,
        `${CSRF_COOKIE}=${CSRF_VALUE}`,
      ])
      .set(CSRF_HEADER, CSRF_VALUE)
      .send(body);

  const post = (actor: Actor, path: string, body: Record<string, unknown>) =>
    mutate('post', actor, path, body);

  const cid = (): string =>
    `n-${harness.runId.slice(0, 8)}-${(uuidCounter += 1).toString().padStart(6, '0')}`;

  async function teamId(actor: Actor): Promise<string> {
    const res = await get(actor, '/chat/conversations').expect(200);
    return res.body.data.find((c: { type: string }) => c.type === 'TEAM')
      .id as string;
  }

  async function directId(actor: Actor, peer: Actor): Promise<string> {
    const res = await post(actor, '/chat/conversations/direct', {
      userId: peer.id,
    }).expect(200);
    return res.body.data.id as string;
  }

  const send = (
    actor: Actor,
    conversationId: string,
    body: string,
    clientMessageId = cid(),
  ) =>
    post(actor, `/chat/conversations/${conversationId}/messages`, {
      clientMessageId,
      body,
    });

  const readUpTo = (actor: Actor, conversationId: string, upTo: number) =>
    post(actor, `/chat/conversations/${conversationId}/read`, {
      upToSequence: upTo,
    });

  const flush = () => chat.flushNotifications();

  /** Chat notifications of one user, oldest first. */
  async function chatRows(user: Actor, conversationId?: string) {
    const rows = await harness.prisma.notification.findMany({
      where: {
        userId: user.id,
        type: 'chat.message',
        ...(conversationId && { entityId: conversationId }),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows as Array<{
      id: string;
      companyId: string;
      userId: string;
      actorId: string | null;
      type: string;
      entityType: string | null;
      entityId: string | null;
      params: Record<string, string>;
      dedupeKey: string;
      readAt: Date | null;
      createdAt: Date;
    }>;
  }

  async function deliveriesOf(notificationIds: string[]) {
    if (notificationIds.length === 0) return [];
    return harness.prisma.notificationDelivery.findMany({
      where: { notificationId: { in: notificationIds } },
    });
  }

  async function storedMessageCount(conversationId: string): Promise<number> {
    const rows = await harness.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM "ChatMessage" WHERE "conversationId" = ${conversationId}`;
    return Number(rows[0].n);
  }

  async function unreadCount(actor: Actor): Promise<number> {
    const res = await get(actor, '/notifications/unread-count').expect(200);
    return res.body.data.count as number;
  }

  async function chatUnread(actor: Actor, conversationId: string) {
    const res = await get(actor, '/chat/conversations').expect(200);
    return res.body.data.find((c: { id: string }) => c.id === conversationId)
      .unreadCount as number;
  }

  function setEnv(name: string, value: string | undefined): void {
    if (!(name in savedEnv)) savedEnv[name] = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  const later = (ms: number) => () => new Date(Date.now() + ms);

  // -------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.assertDatabaseIdentity();
    await harness.recoverOrphans();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WebPushService)
      .useValue(fakePush)
      .compile();

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
    jwt = app.get(JwtService, { strict: false });
    prisma = app.get(PrismaService);
    chat = app.get(ChatService);
    notifications = app.get(NotificationService);
    worker = app.get(NotificationWorker);
    repo = app.get<INotificationRepository>(NOTIFICATION_REPOSITORY);

    expect(process.env.NODE_ENV).toBe('test');
    expect(worker.isEnabled()).toBe(false); // no background loop in tests
    expect(prisma).toBeDefined();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fakePush.failWith = null;
    fakePush.configured = true;
    fakePush.sent.length = 0;
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  afterAll(async () => {
    try {
      if (app) {
        await flush();
        await app.close();
      }
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
  describe('DIRECT messages', () => {
    let companyId: string;
    let alice: Actor;
    let bob: Actor;
    let carol: Actor;
    let dm: string;

    beforeAll(async () => {
      companyId = await createCompany('notif-direct');
      alice = await createUser('alice', companyId);
      bob = await createUser('bob', companyId);
      carol = await createUser('carol', companyId);
      dm = await directId(alice, bob);
    });

    it('notifies ONLY the peer, never the sender, with the approved fields', async () => {
      const sent = await send(alice, dm, 'Lunch at 1?').expect(201);
      await flush();

      const message = sent.body.data.message;

      const forBob = await chatRows(bob);
      expect(forBob).toHaveLength(1);
      expect(forBob[0]).toMatchObject({
        companyId,
        userId: bob.id,
        actorId: alice.id,
        type: 'chat.message',
        entityType: 'chat_conversation',
        entityId: dm,
        dedupeKey: `chat.message:${message.id}`,
        readAt: null,
      });
      expect(forBob[0].params).toEqual({
        messageId: message.id,
        sequence: String(message.sequence),
        conversationType: 'DIRECT',
        snippet: 'Lunch at 1?',
      });
      expect(forBob[0].createdAt).toBeInstanceOf(Date);

      expect(await chatRows(alice)).toHaveLength(0);
      expect(await chatRows(carol)).toHaveLength(0); // not a participant
    });

    it('appears through the EXISTING inbox API, rendered for the recipient', async () => {
      const list = await get(bob, '/notifications').expect(200);
      const item = list.body.data.find(
        (n: { type: string }) => n.type === 'chat.message',
      );

      expect(item).toMatchObject({
        type: 'chat.message',
        title: 'New message',
        body: 'alice: Lunch at 1?'.replace('alice', 'alice Notif'),
        path: `/dashboard/chat?c=${dm}`,
        entityType: 'chat_conversation',
        entityId: dm,
        actor: { id: alice.id },
        readAt: null,
      });
      // The preview is part of the rendered body only, never of params.
      expect(item.params).toEqual({});

      expect(await unreadCount(bob)).toBeGreaterThanOrEqual(1);
      const aliceList = await get(alice, '/notifications').expect(200);
      expect(
        aliceList.body.data.filter(
          (n: { type: string }) => n.type === 'chat.message',
        ),
      ).toHaveLength(0);
    });

    it("renders in the recipient's language (Arabic)", async () => {
      const company = await createCompany('notif-direct-ar');
      const sender = await createUser('sender', company);
      const arabic = await createUser('arabic', company, { language: 'ar' });
      const conversation = await directId(sender, arabic);

      await send(sender, conversation, 'مرحبا بك').expect(201);
      await flush();

      const list = await get(arabic, '/notifications').expect(200);
      expect(list.body.data[0]).toMatchObject({
        title: 'رسالة جديدة',
        body: 'sender Notif: مرحبا بك',
      });
    });

    it('stores a bounded, sanitised snippet while the chat keeps the full text', async () => {
      const long = `${'a'.repeat(200)}\u202e${'b'.repeat(300)}`;
      const sent = await send(alice, dm, long).expect(201);
      await flush();

      const row = (await chatRows(bob)).find(
        (r) => r.params.messageId === sent.body.data.message.id,
      )!;

      expect(Array.from(row.params.snippet)).toHaveLength(80);
      expect(row.params.snippet).not.toMatch(/\u202e/);

      // The chat message itself is untouched by the notification work.
      expect(sent.body.data.message.body).toBe(long);
      const history = await get(
        bob,
        `/chat/conversations/${dm}/messages`,
      ).expect(200);
      expect(
        history.body.data.messages.find(
          (m: { id: string }) => m.id === sent.body.data.message.id,
        ).body,
      ).toBe(long);
    });

    it('is not duplicated by re-sending the same clientMessageId', async () => {
      const clientMessageId = cid();
      const first = await send(alice, dm, 'only once', clientMessageId).expect(
        201,
      );
      await flush();

      for (let i = 0; i < 3; i += 1) {
        const again = await send(
          alice,
          dm,
          'only once',
          clientMessageId,
        ).expect(201);
        expect(again.body.data.duplicate).toBe(true);
        await flush();
      }

      const rows = (await chatRows(bob)).filter(
        (r) => r.params.messageId === first.body.data.message.id,
      );
      expect(rows).toHaveLength(1);
      expect(await storedMessageCount(dm)).toBeGreaterThan(0);
    });

    it('a failed notification never fails or loses the message; the retry repairs it exactly once', async () => {
      const clientMessageId = cid();

      jest
        .spyOn(repo, 'createWithDeliveries')
        .mockRejectedValueOnce(new Error('simulated provider/db failure'));

      const first = await send(alice, dm, 'survives', clientMessageId).expect(
        201,
      );
      await flush();

      const messageId = first.body.data.message.id;

      // The message is durable and visible ...
      const history = await get(
        bob,
        `/chat/conversations/${dm}/messages`,
      ).expect(200);
      expect(
        history.body.data.messages.some(
          (m: { id: string }) => m.id === messageId,
        ),
      ).toBe(true);
      // ... but the inbox row was not created (documented best-effort limit).
      expect(
        (await chatRows(bob)).filter((r) => r.params.messageId === messageId),
      ).toHaveLength(0);

      // The client retries with the same id: the notification is repaired.
      await send(alice, dm, 'survives', clientMessageId).expect(201);
      await flush();
      expect(
        (await chatRows(bob)).filter((r) => r.params.messageId === messageId),
      ).toHaveLength(1);

      // ... and further retries add nothing.
      await send(alice, dm, 'survives', clientMessageId).expect(201);
      await flush();
      expect(
        (await chatRows(bob)).filter((r) => r.params.messageId === messageId),
      ).toHaveLength(1);
    });

    it('concurrent duplicates of one message create exactly one notification', async () => {
      const clientMessageId = cid();

      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          send(alice, dm, 'race me', clientMessageId),
        ),
      );
      await flush();

      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(
        results.filter((r) => r.body.data.duplicate === false),
      ).toHaveLength(1);

      const messageIds = new Set(
        results.map((r) => r.body.data.message.id as string),
      );
      expect(messageIds.size).toBe(1);

      const rows = (await chatRows(bob)).filter((r) =>
        messageIds.has(r.params.messageId),
      );
      expect(rows).toHaveLength(1);
    });

    it('concurrent DIFFERENT messages each get their own notification (nothing lost)', async () => {
      const before = (await chatRows(bob)).length;

      const results = await Promise.all(
        Array.from({ length: 6 }, (_v, i) => send(alice, dm, `parallel ${i}`)),
      );
      await flush();

      for (const r of results) expect(r.status).toBe(201);

      const rows = await chatRows(bob);
      expect(rows).toHaveLength(before + 6);

      const sequences = rows.map((r) => Number(r.params.sequence));
      expect(new Set(sequences).size).toBe(sequences.length);
      expect(new Set(rows.map((r) => r.dedupeKey)).size).toBe(rows.length);
    });

    it('a message sent while the peer has no longer access creates nothing', async () => {
      const company = await createCompany('notif-direct-gone');
      const sender = await createUser('sender', company);
      const gone = await createUser('gone', company);
      const conversation = await directId(sender, gone);

      await harness.prisma.user.update({
        where: { id: gone.id },
        data: { isActive: false },
      });

      await send(sender, conversation, 'anyone there?').expect(403);
      await flush();

      expect(await chatRows(gone)).toHaveLength(0);
      expect(await storedMessageCount(conversation)).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  describe('TEAM messages', () => {
    let companyId: string;
    let sender: Actor;
    let r1: Actor;
    let r2: Actor;
    let leaver: Actor;
    let outsider: Actor; // other company
    let team: string;

    beforeAll(async () => {
      companyId = await createCompany('notif-team');
      const other = await createCompany('notif-team-other');
      sender = await createUser('sender', companyId);
      r1 = await createUser('r1', companyId);
      r2 = await createUser('r2', companyId);
      leaver = await createUser('leaver', companyId);
      outsider = await createUser('outsider', other);
      team = await teamId(sender);
    });

    it('creates ONE unread row per eligible member, never for the sender or another company', async () => {
      const first = await send(sender, team, 'Standup in 5').expect(201);
      await flush();

      for (const member of [r1, r2, leaver]) {
        const rows = await chatRows(member, team);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          companyId,
          actorId: sender.id,
          entityType: 'chat_conversation',
          entityId: team,
          dedupeKey: `chat.message:team:${team}`,
          readAt: null,
        });
        expect(rows[0].params).toEqual({
          messageId: first.body.data.message.id,
          sequence: String(first.body.data.message.sequence),
          conversationType: 'TEAM',
          snippet: 'Standup in 5',
        });
      }

      expect(await chatRows(sender)).toHaveLength(0);
      expect(await chatRows(outsider)).toHaveLength(0);
    });

    it('a later message ADVANCES the same row (still one per user), with the latest actor, snippet and link', async () => {
      const before = await chatRows(r1, team);

      await new Promise((r) => setTimeout(r, 15));
      const second = await send(r2, team, 'Moved to room B').expect(201);
      await flush();

      const rows = await chatRows(r1, team);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(before[0].id);
      expect(rows[0].actorId).toBe(r2.id);
      expect(rows[0].params.messageId).toBe(second.body.data.message.id);
      expect(rows[0].params.snippet).toBe('Moved to room B');
      expect(Number(rows[0].params.sequence)).toBe(
        second.body.data.message.sequence,
      );
      expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        before[0].createdAt.getTime(),
      );

      // r2 (the sender of THIS message) got none from it, but did get one
      // from the earlier message of `sender`: still exactly one row.
      const r2Rows = await chatRows(r2, team);
      expect(r2Rows).toHaveLength(1);
      expect(r2Rows[0].params.snippet).toBe('Standup in 5');

      // The link always points at the right conversation.
      const list = await get(r1, '/notifications').expect(200);
      const item = list.body.data.find(
        (n: { type: string }) => n.type === 'chat.message',
      );
      expect(item).toMatchObject({
        title: 'New messages in the team chat',
        path: `/dashboard/chat?c=${team}`,
      });
    });

    it('the advanced row moves to the top of the inbox again', async () => {
      await notifications.publish({
        type: 'task.assigned',
        companyId,
        actorId: sender.id,
        recipientIds: [r1.id],
        entityType: 'task',
        entityId: 'task-1',
        title: 'A newer task',
        occurrenceId: cid(),
      });
      await new Promise((r) => setTimeout(r, 15));

      let list = await get(r1, '/notifications').expect(200);
      expect(list.body.data[0].type).toBe('task.assigned');

      await new Promise((r) => setTimeout(r, 15));
      await send(sender, team, 'bump').expect(201);
      await flush();

      list = await get(r1, '/notifications').expect(200);
      expect(list.body.data[0].type).toBe('chat.message');
      expect(list.body.data[0].body).toBe('sender Notif: bump');
      // Still a single chat row; the task notification is untouched.
      expect(
        list.body.data.filter(
          (n: { type: string }) => n.type === 'chat.message',
        ),
      ).toHaveLength(1);
      expect(
        list.body.data.filter(
          (n: { type: string }) => n.type === 'task.assigned',
        ),
      ).toHaveLength(1);
    });

    it('honours the historical audience: a later joiner gets rows only for messages sent after joining; a deactivated member gets none', async () => {
      const company = await createCompany('notif-team-audience');
      const first = await createUser('first', company);
      const early = await createUser('early', company);
      const away = await createUser('away', company);
      const conversation = await teamId(first);

      await send(first, conversation, 'before the joiner').expect(201);
      await flush();

      const joiner = await createUser('joiner', company);
      // The joiner was not in the audience of the earlier message.
      expect(await chatRows(joiner)).toHaveLength(0);

      await harness.prisma.user.update({
        where: { id: away.id },
        data: { isActive: false },
      });
      const awayBefore = (await chatRows(away)).length;

      const after = await send(first, conversation, 'after the joiner').expect(
        201,
      );
      await flush();

      const joinerRows = await chatRows(joiner);
      expect(joinerRows).toHaveLength(1);
      expect(joinerRows[0].params.messageId).toBe(after.body.data.message.id);

      expect((await chatRows(early))[0].params.messageId).toBe(
        after.body.data.message.id,
      );
      // While deactivated the member is not part of the audience.
      expect(await chatRows(away)).toHaveLength(awayBefore);
    });

    it('concurrent TEAM messages from several senders: one row per user, ending at the highest sequence, nothing lost', async () => {
      const company = await createCompany('notif-team-race');
      const a = await createUser('a', company);
      const b = await createUser('b', company);
      const c = await createUser('c', company);
      const conversation = await teamId(a);

      const results = await Promise.all([
        ...Array.from({ length: 6 }, (_v, i) =>
          send(a, conversation, `from a ${i}`),
        ),
        ...Array.from({ length: 4 }, (_v, i) =>
          send(b, conversation, `from b ${i}`),
        ),
      ]);
      await flush();

      for (const r of results) expect(r.status).toBe(201);

      const maxSequence = Math.max(
        ...results.map((r) => r.body.data.message.sequence as number),
      );
      expect(maxSequence).toBe(10);

      for (const user of [a, b, c]) {
        const rows = await chatRows(user, conversation);
        expect(rows).toHaveLength(1);
      }

      // c only ever receives: its row reflects the LAST message.
      const cRow = (await chatRows(c, conversation))[0];
      expect(Number(cRow.params.sequence)).toBe(maxSequence);
      expect(cRow.readAt).toBeNull();

      // a and b sent messages too, and each received the other's: their
      // rows point at the highest sequence NOT sent by themselves.
      const lastFromB = Math.max(
        ...results.slice(6).map((r) => r.body.data.message.sequence as number),
      );
      const lastFromA = Math.max(
        ...results
          .slice(0, 6)
          .map((r) => r.body.data.message.sequence as number),
      );
      expect(Number((await chatRows(a, conversation))[0].params.sequence)).toBe(
        lastFromB,
      );
      expect(Number((await chatRows(b, conversation))[0].params.sequence)).toBe(
        lastFromA,
      );
    });

    it('a failed TEAM notification never fails the send; a retry repairs it', async () => {
      const company = await createCompany('notif-team-retry');
      const a = await createUser('a', company);
      const b = await createUser('b', company);
      const conversation = await teamId(a);
      const clientMessageId = cid();

      jest
        .spyOn(repo, 'upsertChatTeamNotifications')
        .mockRejectedValueOnce(new Error('simulated'));

      const first = await send(
        a,
        conversation,
        'hello',
        clientMessageId,
      ).expect(201);
      await flush();
      expect(await chatRows(b, conversation)).toHaveLength(0);
      expect(await storedMessageCount(conversation)).toBe(1);

      await send(a, conversation, 'hello', clientMessageId).expect(201);
      await flush();

      const rows = await chatRows(b, conversation);
      expect(rows).toHaveLength(1);
      expect(rows[0].params.messageId).toBe(first.body.data.message.id);

      await send(a, conversation, 'hello', clientMessageId).expect(201);
      await flush();
      expect(await chatRows(b, conversation)).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------
  describe('upsertChatTeamNotifications (SQL guard)', () => {
    let companyId: string;
    let sender: Actor;
    let u1: Actor;
    let u2: Actor;
    let inactive: Actor;
    let foreign: Actor;

    beforeAll(async () => {
      companyId = await createCompany('notif-upsert');
      const other = await createCompany('notif-upsert-other');
      sender = await createUser('sender', companyId);
      u1 = await createUser('u1', companyId);
      u2 = await createUser('u2', companyId);
      inactive = await createUser('inactive', companyId, { isActive: false });
      foreign = await createUser('foreign', other);
    });

    const params = (n: number) => ({
      messageId: `m${n}`,
      sequence: String(n),
      conversationType: 'TEAM',
      snippet: `s${n}`,
    });

    const upsert = (conversationId: string, n: number, userIds: string[]) =>
      repo.upsertChatTeamNotifications({
        companyId,
        actorId: sender.id,
        conversationId,
        dedupeKey: `chat.message:team:${conversationId}`,
        params: params(n),
        userIds,
      });

    it("never inserts for an inactive user, another company's user or an unknown id", async () => {
      const conversation = `conv-elig-${cid()}`;

      const notified = await upsert(conversation, 1, [
        u1.id,
        inactive.id,
        foreign.id,
        'does-not-exist',
      ]);

      expect(notified).toEqual([u1.id]);
      expect(await chatRows(inactive)).toHaveLength(0);
      expect(await chatRows(foreign)).toHaveLength(0);
    });

    it('an older or repeated sequence changes nothing; a newer one advances', async () => {
      const conversation = `conv-order-${cid()}`;

      expect(await upsert(conversation, 5, [u1.id, u2.id])).toHaveLength(2);
      expect(await upsert(conversation, 5, [u1.id, u2.id])).toEqual([]);
      expect(await upsert(conversation, 3, [u1.id, u2.id])).toEqual([]);

      let [row] = await chatRows(u1, conversation);
      expect(row.params.sequence).toBe('5');
      expect(row.params.messageId).toBe('m5');

      expect(await upsert(conversation, 6, [u1.id])).toEqual([u1.id]);
      [row] = await chatRows(u1, conversation);
      expect(row.params.sequence).toBe('6');

      // u2 was not part of the last call: untouched.
      expect((await chatRows(u2, conversation))[0].params.sequence).toBe('5');
    });

    it('any interleaving of racing upserts converges on the highest sequence, one row per user', async () => {
      for (let round = 0; round < 5; round += 1) {
        const conversation = `conv-race-${round}-${cid()}`;
        const order = [5, 3, 4, 1, 2, 5, 5, 3, 4, 2].sort(
          () => Math.random() - 0.5,
        );

        await Promise.all(
          order.map((n) => upsert(conversation, n, [u1.id, u2.id])),
        );

        for (const user of [u1, u2]) {
          const rows = await chatRows(user, conversation);
          expect(rows).toHaveLength(1);
          expect(rows[0].params.sequence).toBe('5');
          expect(rows[0].params.messageId).toBe('m5');
        }
      }
    });

    it('marking read up to N never hides a newer message, whatever the interleaving', async () => {
      for (let round = 0; round < 8; round += 1) {
        const conversation = `conv-mark-${round}-${cid()}`;
        await upsert(conversation, 5, [u1.id]);

        await Promise.all([
          upsert(conversation, 6, [u1.id]),
          repo.markChatConversationRead(companyId, u1.id, conversation, 5),
        ]);

        const [row] = await chatRows(u1, conversation);
        expect(row.params.sequence).toBe('6');
        expect(row.readAt).toBeNull();
      }
    });

    it('a read row stays read when an older or repeated message is replayed, and re-opens for a newer one', async () => {
      const conversation = `conv-reopen-${cid()}`;
      await upsert(conversation, 5, [u1.id]);

      expect(
        await repo.markChatConversationRead(companyId, u1.id, conversation, 5),
      ).toBe(1);
      expect((await chatRows(u1, conversation))[0].readAt).not.toBeNull();

      expect(await upsert(conversation, 5, [u1.id])).toEqual([]);
      expect(await upsert(conversation, 4, [u1.id])).toEqual([]);
      expect((await chatRows(u1, conversation))[0].readAt).not.toBeNull();

      expect(await upsert(conversation, 7, [u1.id])).toEqual([u1.id]);
      const [row] = await chatRows(u1, conversation);
      expect(row.readAt).toBeNull();
      expect(row.params.sequence).toBe('7');
    });

    it('markChatConversationRead is scoped to company, user, conversation and type', async () => {
      const convA = `conv-scope-a-${cid()}`;
      const convB = `conv-scope-b-${cid()}`;
      await upsert(convA, 2, [u1.id, u2.id]);
      await upsert(convB, 2, [u1.id]);

      // Wrong company: nothing.
      expect(
        await repo.markChatConversationRead('other-company', u1.id, convA, 9),
      ).toBe(0);
      // Another conversation / another user stay untouched.
      expect(
        await repo.markChatConversationRead(companyId, u1.id, convA, 9),
      ).toBe(1);
      expect((await chatRows(u1, convB))[0].readAt).toBeNull();
      expect((await chatRows(u2, convA))[0].readAt).toBeNull();

      // Invalid cursors are no-ops.
      expect(
        await repo.markChatConversationRead(companyId, u1.id, convB, 0),
      ).toBe(0);
      expect(
        await repo.markChatConversationRead(
          companyId,
          u1.id,
          convB,
          Number.NaN,
        ),
      ).toBe(0);
    });

    it('ignores a row whose params.sequence is missing or not a plain number (no SQL error)', async () => {
      const conversation = `conv-bad-${cid()}`;
      await harness.prisma.notification.create({
        data: {
          companyId,
          userId: u1.id,
          type: 'chat.message',
          entityType: 'chat_conversation',
          entityId: conversation,
          params: { sequence: 'abc' },
          dedupeKey: `chat.message:team:${conversation}`,
        },
      });

      expect(
        await repo.markChatConversationRead(companyId, u1.id, conversation, 9),
      ).toBe(0);

      // A real message replaces the malformed row's content.
      expect(await upsert(conversation, 2, [u1.id])).toEqual([u1.id]);
      expect((await chatRows(u1, conversation))[0].params.sequence).toBe('2');
    });
  });

  // -------------------------------------------------------------------
  describe('read direction: chat -> notifications only', () => {
    let companyId: string;
    let alice: Actor;
    let bob: Actor;
    let carol: Actor;
    let dmAB: string;
    let dmCB: string;
    let team: string;

    beforeAll(async () => {
      companyId = await createCompany('notif-read');
      alice = await createUser('alice', companyId);
      bob = await createUser('bob', companyId);
      carol = await createUser('carol', companyId);
      dmAB = await directId(alice, bob);
      dmCB = await directId(carol, bob);
      team = await teamId(alice);
    });

    it('DIRECT: a read ack marks exactly the notifications up to the cursor, in that conversation only', async () => {
      const m1 = await send(alice, dmAB, 'one').expect(201);
      const m2 = await send(alice, dmAB, 'two').expect(201);
      const m3 = await send(alice, dmAB, 'three').expect(201);
      await send(carol, dmCB, 'other conversation').expect(201);
      await flush();

      expect(await chatRows(bob, dmAB)).toHaveLength(3);
      expect(await unreadCount(bob)).toBe(4);

      await readUpTo(bob, dmAB, m2.body.data.message.sequence).expect(200);

      const rows = await chatRows(bob, dmAB);
      const bySeq = new Map(rows.map((r) => [Number(r.params.sequence), r]));
      expect(bySeq.get(m1.body.data.message.sequence)!.readAt).not.toBeNull();
      expect(bySeq.get(m2.body.data.message.sequence)!.readAt).not.toBeNull();
      expect(bySeq.get(m3.body.data.message.sequence)!.readAt).toBeNull();

      // The other conversation's notification is untouched.
      expect((await chatRows(bob, dmCB))[0].readAt).toBeNull();
      expect(await unreadCount(bob)).toBe(2);

      await readUpTo(bob, dmAB, m3.body.data.message.sequence).expect(200);
      expect(await unreadCount(bob)).toBe(1);
    });

    it('a cursor beyond the real last message is clamped, never marking newer ones', async () => {
      const company = await createCompany('notif-read-clamp');
      const a = await createUser('a', company);
      const b = await createUser('b', company);
      const conversation = await directId(a, b);

      await send(a, conversation, 'one').expect(201);
      await flush();
      await readUpTo(b, conversation, 1).expect(200);

      const m2 = await send(a, conversation, 'two').expect(201);
      await flush();

      // A stale/over-large ack: the cursor can only reach what exists.
      await readUpTo(b, conversation, 1).expect(200);
      const rows = await chatRows(b, conversation);
      const second = rows.find(
        (r) => r.params.messageId === m2.body.data.message.id,
      )!;
      expect(second.readAt).toBeNull();
    });

    it('TEAM: the row is read only once the cursor reaches the latest message; a partial ack keeps it unread', async () => {
      const m1 = await send(alice, team, 't1').expect(201);
      const m2 = await send(alice, team, 't2').expect(201);
      const m3 = await send(alice, team, 't3').expect(201);
      await flush();

      expect(m3.body.data.message.sequence).toBeGreaterThan(
        m1.body.data.message.sequence,
      );
      expect((await chatRows(bob, team))[0].readAt).toBeNull();

      await readUpTo(bob, team, m2.body.data.message.sequence).expect(200);
      expect((await chatRows(bob, team))[0].readAt).toBeNull();

      await readUpTo(bob, team, m3.body.data.message.sequence).expect(200);
      expect((await chatRows(bob, team))[0].readAt).not.toBeNull();

      // A newer message re-opens the same row as unread.
      const m4 = await send(alice, team, 't4').expect(201);
      await flush();
      const rows = await chatRows(bob, team);
      expect(rows).toHaveLength(1);
      expect(rows[0].readAt).toBeNull();
      expect(rows[0].params.messageId).toBe(m4.body.data.message.id);
    });

    it('opening / marking a NOTIFICATION as read never reads the chat (no reverse direction)', async () => {
      const company = await createCompany('notif-read-reverse');
      const a = await createUser('a', company);
      const b = await createUser('b', company);
      const conversation = await directId(a, b);

      await send(a, conversation, 'unread in chat').expect(201);
      await send(a, conversation, 'unread in chat 2').expect(201);
      await flush();

      expect(await chatUnread(b, conversation)).toBe(2);

      const rows = await chatRows(b, conversation);
      await mutate('patch', b, `/notifications/${rows[0].id}/read`).expect(200);
      expect(await chatUnread(b, conversation)).toBe(2);

      await mutate('post', b, '/notifications/read-all').expect(200);
      expect(await unreadCount(b)).toBe(0);
      expect(await chatUnread(b, conversation)).toBe(2);

      // The chat read cursor did not move: reading it now does.
      await readUpTo(b, conversation, 2).expect(200);
      expect(await chatUnread(b, conversation)).toBe(0);
    });

    it('a read ack that arrives BEFORE the notification row exists still converges to "read"', async () => {
      const company = await createCompany('notif-read-race');
      const a = await createUser('a', company);
      const b = await createUser('b', company);
      const conversation = await directId(a, b);

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = repo.createWithDeliveries.bind(repo);
      jest
        .spyOn(repo, 'createWithDeliveries')
        .mockImplementationOnce(async (input) => {
          await gate;
          return original(input);
        });

      const sent = await send(a, conversation, 'fast reader').expect(201);

      // The recipient reads it while the notification is still being made.
      await readUpTo(b, conversation, sent.body.data.message.sequence).expect(
        200,
      );
      expect(await chatRows(b, conversation)).toHaveLength(0);

      release();
      await flush();

      const rows = await chatRows(b, conversation);
      expect(rows).toHaveLength(1);
      expect(rows[0].readAt).not.toBeNull();
      expect(await unreadCount(b)).toBe(0);
    });

    it('TEAM: the same convergence holds for a row created after the ack', async () => {
      const company = await createCompany('notif-read-race-team');
      const a = await createUser('a', company);
      const b = await createUser('b', company);
      const conversation = await teamId(a);

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = repo.upsertChatTeamNotifications.bind(repo);
      jest
        .spyOn(repo, 'upsertChatTeamNotifications')
        .mockImplementationOnce(async (input) => {
          await gate;
          return original(input);
        });

      const sent = await send(a, conversation, 'fast reader').expect(201);
      await readUpTo(b, conversation, sent.body.data.message.sequence).expect(
        200,
      );

      release();
      await flush();

      const rows = await chatRows(b, conversation);
      expect(rows).toHaveLength(1);
      expect(rows[0].readAt).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------
  describe('isolation and access', () => {
    let companyA: string;
    let companyB: string;
    let alice: Actor;
    let bob: Actor;
    let carol: Actor;
    let eve: Actor; // company B
    let dm: string;
    let team: string;

    beforeAll(async () => {
      companyA = await createCompany('notif-iso-a');
      companyB = await createCompany('notif-iso-b');
      alice = await createUser('alice', companyA);
      bob = await createUser('bob', companyA);
      carol = await createUser('carol', companyA);
      eve = await createUser('eve', companyB);
      dm = await directId(alice, bob);
      team = await teamId(alice);
    });

    it('nothing is ever created for another company, whatever is sent', async () => {
      await send(alice, team, 'to my team only').expect(201);
      await send(alice, dm, 'to bob only').expect(201);
      await flush();

      expect(await chatRows(eve)).toHaveLength(0);

      const list = await get(eve, '/notifications').expect(200);
      expect(list.body.data).toHaveLength(0);
      expect(await unreadCount(eve)).toBe(0);

      // A direct conversation across companies cannot even be opened.
      const cross = await post(alice, '/chat/conversations/direct', {
        userId: eve.id,
      });
      expect([403, 404]).toContain(cross.status);
    });

    it('a non-participant gets no notification and cannot read or mark anything of the conversation', async () => {
      await flush();
      expect(await chatRows(carol, dm)).toHaveLength(0);

      const bobBefore = (await chatRows(bob, dm)).filter(
        (r) => r.readAt === null,
      ).length;
      expect(bobBefore).toBeGreaterThan(0);

      await get(carol, `/chat/conversations/${dm}/messages`).expect(404);
      await readUpTo(carol, dm, 99).expect(404);
      await send(carol, dm, 'eavesdrop').expect(404);

      // Bob's notifications are exactly as they were.
      expect(
        (await chatRows(bob, dm)).filter((r) => r.readAt === null).length,
      ).toBe(bobBefore);
    });

    it('another company cannot read or mark a conversation by id', async () => {
      await readUpTo(eve, dm, 99).expect(404);
      await readUpTo(eve, team, 99).expect(404);
      await get(eve, `/chat/conversations/${dm}/messages`).expect(404);

      expect((await chatRows(bob, dm)).every((r) => r.readAt === null)).toBe(
        true,
      );
    });

    it("nobody can mark someone else's notification as read (uniform 404)", async () => {
      const [row] = await chatRows(bob, dm);

      await mutate('patch', alice, `/notifications/${row.id}/read`).expect(404);
      await mutate('patch', eve, `/notifications/${row.id}/read`).expect(404);

      const [after] = await chatRows(bob, dm);
      expect(after.readAt).toBeNull();
    });

    it('a user who lost access cannot open the conversation from an old notification', async () => {
      const company = await createCompany('notif-iso-lost');
      const a = await createUser('a', company);
      const b = await createUser('b', company);
      const conversation = await directId(a, b);

      await send(a, conversation, 'before').expect(201);
      await flush();
      expect(await chatRows(b, conversation)).toHaveLength(1);

      await harness.prisma.user.update({
        where: { id: b.id },
        data: { isActive: false },
      });

      // The old notification row still exists, but its target is closed.
      expect(await chatRows(b, conversation)).toHaveLength(1);
      await get(b, `/chat/conversations/${conversation}/messages`).expect(401);
      await readUpTo(b, conversation, 1).expect(401);
      expect((await chatRows(b, conversation))[0].readAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  describe('external channels (push) - policy D3', () => {
    let companyId: string;
    let alice: Actor;
    let bob: Actor;
    let carol: Actor;
    let dm: string;
    let team: string;
    let bobDevice: string;

    beforeAll(async () => {
      companyId = await createCompany('notif-push');
      alice = await createUser('alice', companyId);
      bob = await createUser('bob', companyId);
      carol = await createUser('carol', companyId);
      dm = await directId(alice, bob);
      team = await teamId(alice);

      const device = await harness.prisma.pushSubscription.create({
        data: {
          companyId,
          userId: bob.id,
          endpoint: `https://push.example.test/${cid()}`,
          p256dh: 'p256dh-test',
          auth: 'auth-test',
        },
        select: { id: true },
      });
      bobDevice = device.id;
    });

    /** Notification ids of the chat rows bob has right now. */
    const bobChatIds = async () => (await chatRows(bob)).map((r) => r.id);

    it('CHAT_PUSH_ENABLED unset (the default): NO push delivery is created, only the inbox row', async () => {
      setEnv('CHAT_PUSH_ENABLED', undefined);

      await send(alice, dm, 'default off').expect(201);
      await flush();

      const rows = await chatRows(bob, dm);
      expect(rows.length).toBeGreaterThan(0);
      expect(await deliveriesOf(await bobChatIds())).toHaveLength(0);
    });

    it('flag on: one DELAYED push for the device; sent only after the delay, without message text', async () => {
      setEnv('CHAT_PUSH_ENABLED', 'true');
      setEnv('CHAT_PUSH_DELAY_MS', '45000');

      const sent = await send(alice, dm, 'TOP SECRET plan').expect(201);
      await flush();

      const row = (await chatRows(bob, dm)).find(
        (r) => r.params.messageId === sent.body.data.message.id,
      )!;
      const deliveries = await deliveriesOf([row.id]);

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({
        channel: 'push',
        target: bobDevice,
        status: 'pending',
      });
      expect(deliveries[0].nextAttemptAt.getTime()).toBeGreaterThan(
        Date.now() + 30_000,
      );

      // Not due yet: a tick right now sends nothing.
      await worker.tick(() => new Date());
      expect(fakePush.sent).toHaveLength(0);

      // After the delay it is sent once.
      await worker.tick(later(2 * 60_000));
      expect(fakePush.sent).toHaveLength(1);

      const { payload } = fakePush.sent[0];
      expect(JSON.stringify(payload)).not.toContain('TOP SECRET');
      expect(payload).toEqual({
        title: 'New message',
        body: 'alice Notif sent you a message.',
        path: `/dashboard/chat?c=${dm}`,
        tag: `chat-${dm}`,
      });

      const [done] = await deliveriesOf([row.id]);
      expect(done.status).toBe('sent');

      // Never re-sent by later ticks.
      await worker.tick(later(10 * 60_000));
      expect(fakePush.sent).toHaveLength(1);
    });

    it('a message read during the delay is skipped, not pushed', async () => {
      setEnv('CHAT_PUSH_ENABLED', 'true');

      const sent = await send(alice, dm, 'read quickly').expect(201);
      await flush();
      await readUpTo(bob, dm, sent.body.data.message.sequence).expect(200);

      await worker.tick(later(2 * 60_000));

      expect(fakePush.sent).toHaveLength(0);
      const row = (await chatRows(bob, dm)).find(
        (r) => r.params.messageId === sent.body.data.message.id,
      )!;
      const [delivery] = await deliveriesOf([row.id]);
      expect(delivery).toMatchObject({
        status: 'skipped',
        lastErrorCode: 'already_read',
      });
    });

    it('turning the flag off also stops pushes that were queued earlier', async () => {
      setEnv('CHAT_PUSH_ENABLED', 'true');
      const sent = await send(alice, dm, 'queued then disabled').expect(201);
      await flush();

      setEnv('CHAT_PUSH_ENABLED', 'false');
      await worker.tick(later(2 * 60_000));

      expect(fakePush.sent).toHaveLength(0);
      const row = (await chatRows(bob, dm)).find(
        (r) => r.params.messageId === sent.body.data.message.id,
      )!;
      expect((await deliveriesOf([row.id]))[0]).toMatchObject({
        status: 'skipped',
        lastErrorCode: 'channel_disabled',
      });
    });

    it('a provider failure keeps the message AND the inbox row, retries, and never double-sends', async () => {
      setEnv('CHAT_PUSH_ENABLED', 'true');
      const sent = await send(alice, dm, 'flaky provider').expect(201);
      await flush();

      const row = (await chatRows(bob, dm)).find(
        (r) => r.params.messageId === sent.body.data.message.id,
      )!;

      fakePush.failWith = new PushSendError('network_error');
      await worker.tick(later(2 * 60_000));

      let [delivery] = await deliveriesOf([row.id]);
      expect(delivery.status).toBe('pending'); // scheduled for a retry
      expect(delivery.attempts).toBe(1);
      expect(fakePush.sent).toHaveLength(0);

      // The chat message and the internal record are untouched.
      expect(
        (
          await get(bob, `/chat/conversations/${dm}/messages`).expect(200)
        ).body.data.messages.some(
          (m: { id: string }) => m.id === sent.body.data.message.id,
        ),
      ).toBe(true);
      expect((await chatRows(bob, dm)).some((r) => r.id === row.id)).toBe(true);
      expect(
        (await chatRows(bob, dm)).find((r) => r.id === row.id)!.readAt,
      ).toBeNull();

      // The provider recovers: delivered exactly once.
      fakePush.failWith = null;
      await worker.tick(later(10 * 60_000));
      expect(fakePush.sent).toHaveLength(1);
      [delivery] = await deliveriesOf([row.id]);
      expect(delivery.status).toBe('sent');

      await worker.tick(later(30 * 60_000));
      expect(fakePush.sent).toHaveLength(1);
    });

    it('a user who opted out of push gets the inbox row but no delivery', async () => {
      setEnv('CHAT_PUSH_ENABLED', 'true');
      await harness.prisma.notificationPreference.create({
        data: {
          companyId,
          userId: bob.id,
          channel: 'push',
          type: '*',
          enabled: false,
        },
      });

      try {
        const sent = await send(alice, dm, 'opted out').expect(201);
        await flush();

        const row = (await chatRows(bob, dm)).find(
          (r) => r.params.messageId === sent.body.data.message.id,
        )!;
        expect(await deliveriesOf([row.id])).toHaveLength(0);
      } finally {
        await harness.prisma.notificationPreference.deleteMany({
          where: { companyId, userId: bob.id, channel: 'push' },
        });
      }
    });

    it('a user with no device gets the inbox row and no delivery (nothing breaks)', async () => {
      setEnv('CHAT_PUSH_ENABLED', 'true');
      const sent = await send(
        alice,
        await directId(alice, carol),
        'no device',
      ).expect(201);
      await flush();

      const rows = await chatRows(carol);
      expect(rows.length).toBeGreaterThan(0);
      expect(await deliveriesOf(rows.map((r) => r.id))).toHaveLength(0);
      expect(sent.body.data.message.id).toBeDefined();
    });

    it('TEAM messages and email never produce external deliveries, even with everything enabled', async () => {
      setEnv('CHAT_PUSH_ENABLED', 'true');
      setEnv('NOTIFICATIONS_EMAIL_ENABLED', 'true');

      await send(alice, team, 'team news').expect(201);
      await flush();

      const teamRows = await chatRows(bob, team);
      expect(teamRows).toHaveLength(1);
      expect(await deliveriesOf(teamRows.map((r) => r.id))).toHaveLength(0);

      // Across every chat notification of the company: no email delivery.
      const all = [...(await chatRows(bob)), ...(await chatRows(carol))];
      const deliveries = await deliveriesOf(all.map((r) => r.id));
      expect(deliveries.filter((d) => d.channel === 'email')).toHaveLength(0);
      expect(
        deliveries.every((d) => d.channel === 'push' && d.target === bobDevice),
      ).toBe(true);

      await worker.tick(later(2 * 60_000));
      expect(
        fakePush.sent.every((s) => s.payload.tag.startsWith('chat-')),
      ).toBe(true);
    });

    it('regression: other notification types keep their immediate push, unaffected by the chat flag', async () => {
      setEnv('CHAT_PUSH_ENABLED', undefined);

      await notifications.publish({
        type: 'task.assigned',
        companyId,
        actorId: alice.id,
        recipientIds: [bob.id],
        entityType: 'task',
        entityId: 'task-regression',
        title: 'Regression task',
        occurrenceId: cid(),
      });

      const [task] = (await harness.prisma.notification.findMany({
        where: {
          userId: bob.id,
          type: 'task.assigned',
          entityId: 'task-regression',
        },
      })) as Array<{ id: string }>;
      const deliveries = await deliveriesOf([task.id]);
      expect(deliveries).toHaveLength(1);

      // Due immediately: no delay was applied to the existing types.
      expect(deliveries[0].nextAttemptAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 1000,
      );

      fakePush.sent.length = 0;
      await worker.tick(() => new Date(Date.now() + 1000));
      const pushed = fakePush.sent.find((s) =>
        String(s.payload.body).includes('Regression task'),
      );
      expect(pushed).toBeDefined();
      expect(pushed!.payload.tag).toBe(`notification-${task.id}`);
    });
  });
});
