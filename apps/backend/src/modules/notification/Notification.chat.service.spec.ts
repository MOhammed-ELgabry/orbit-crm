/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/require-await -- jest mocks are asserted through detached method references; async mock implementations mirror the repository contract */
import type { ConfigService } from '@nestjs/config';

import { NotificationService } from './notification.service';
import type { WebPushService } from './web-push.service';
import type { INotificationRepository } from './repository/notification.repository.interface';

type Repo = jest.Mocked<INotificationRepository>;

const COMPANY = 'company-a';

function makeRepository(): Repo {
  const names: Array<keyof INotificationRepository> = [
    'findManyForUser',
    'countUnread',
    'markRead',
    'markAllRead',
    'findUserLanguage',
    'findEligibleRecipients',
    'findDisabledChannels',
    'findPushSubscriptionTargets',
    'createWithDeliveries',
    'upsertChatTeamNotifications',
    'markChatConversationRead',
  ];
  const repo: Partial<Record<keyof INotificationRepository, jest.Mock>> = {};
  for (const name of names) repo[name] = jest.fn();

  const r = repo as Repo;
  r.findEligibleRecipients.mockImplementation(async (_c, ids) =>
    ids.map((id) => ({ id, language: 'en' })),
  );
  r.findDisabledChannels.mockResolvedValue([]);
  r.findPushSubscriptionTargets.mockResolvedValue([]);
  r.createWithDeliveries.mockResolvedValue({ id: 'n1' });
  r.upsertChatTeamNotifications.mockImplementation(async (input) => [
    ...input.userIds,
  ]);
  r.markChatConversationRead.mockResolvedValue(0);
  return r;
}

describe('NotificationService.publishChatMessage', () => {
  let repo: Repo;
  let env: Record<string, string | undefined>;
  let pushConfigured: boolean;
  let worker: { kick: jest.Mock };
  let service: NotificationService;

  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;

  const webPush = {
    isConfigured: () => pushConfigured,
    getPublicKey: () => null,
  } as unknown as WebPushService;

  const direct = (overrides: Record<string, unknown> = {}) => ({
    companyId: COMPANY,
    senderId: 'alice',
    conversationId: 'dm-1',
    conversationType: 'DIRECT' as const,
    messageId: 'msg-1',
    sequence: 7,
    body: 'hello there',
    recipientIds: ['bob'] as Array<string | null | undefined>,
    ...overrides,
  });

  const team = (overrides: Record<string, unknown> = {}) =>
    direct({
      conversationId: 'team-1',
      conversationType: 'TEAM',
      recipientIds: ['bob', 'carol'],
      ...overrides,
    });

  beforeEach(() => {
    repo = makeRepository();
    env = {};
    pushConfigured = false;
    worker = { kick: jest.fn() };

    service = new NotificationService(repo, config, webPush, worker);
  });

  describe('DIRECT', () => {
    it('creates ONE inbox row for the peer, tied to the conversation and message', async () => {
      const result = await service.publishChatMessage(direct());

      expect(result.notifiedUserIds).toEqual(['bob']);
      expect(repo.createWithDeliveries).toHaveBeenCalledTimes(1);
      expect(repo.createWithDeliveries).toHaveBeenCalledWith({
        companyId: COMPANY,
        userId: 'bob',
        actorId: 'alice',
        type: 'chat.message',
        entityType: 'chat_conversation',
        entityId: 'dm-1',
        params: {
          messageId: 'msg-1',
          sequence: '7',
          conversationType: 'DIRECT',
          snippet: 'hello there',
        },
        dedupeKey: 'chat.message:msg-1',
        deliveries: [],
      });
    });

    it('never notifies the sender, nulls or duplicates', async () => {
      await service.publishChatMessage(
        direct({ recipientIds: ['alice', null, undefined, '', 'bob', 'bob'] }),
      );

      expect(repo.findEligibleRecipients).toHaveBeenCalledWith(COMPANY, [
        'bob',
      ]);
      expect(repo.createWithDeliveries).toHaveBeenCalledTimes(1);
    });

    it('does nothing when there is no recipient left', async () => {
      const result = await service.publishChatMessage(
        direct({ recipientIds: ['alice'] }),
      );

      expect(result.notifiedUserIds).toEqual([]);
      expect(repo.findEligibleRecipients).not.toHaveBeenCalled();
      expect(repo.createWithDeliveries).not.toHaveBeenCalled();
    });

    it('skips a recipient the repository does not consider eligible', async () => {
      repo.findEligibleRecipients.mockResolvedValue([]);

      const result = await service.publishChatMessage(direct());

      expect(result.notifiedUserIds).toEqual([]);
      expect(repo.createWithDeliveries).not.toHaveBeenCalled();
    });

    it('a repeated message (unique violation -> null) is not reported as notified', async () => {
      repo.createWithDeliveries.mockResolvedValue(null);

      const result = await service.publishChatMessage(direct());

      expect(result.notifiedUserIds).toEqual([]);
    });

    it('stores a bounded, sanitised snippet and never the raw body', async () => {
      await service.publishChatMessage(
        direct({ body: `line1\n‮line2 ${'z'.repeat(500)}` }),
      );

      const params = repo.createWithDeliveries.mock.calls[0][0].params;

      expect(Array.from(params.snippet)).toHaveLength(80);
      expect(params.snippet).not.toMatch(/[\n‮]/);
      expect(Object.values(params).join('')).not.toContain('z'.repeat(100));
    });

    it('omits the snippet when the text is empty after sanitising', async () => {
      await service.publishChatMessage(direct({ body: '​‮ \n' }));

      expect(
        repo.createWithDeliveries.mock.calls[0][0].params,
      ).not.toHaveProperty('snippet');
    });

    it('rejects an invalid sequence without touching the database', async () => {
      for (const sequence of [0, -1, 1.5, Number.NaN, 2 ** 60]) {
        const result = await service.publishChatMessage(direct({ sequence }));
        expect(result.notifiedUserIds).toEqual([]);
      }

      expect(repo.createWithDeliveries).not.toHaveBeenCalled();
    });

    it('one failing recipient never prevents the others (defensive loop)', async () => {
      repo.createWithDeliveries
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue({ id: 'n2' });

      const result = await service.publishChatMessage(
        direct({ recipientIds: ['bob', 'carol'] }),
      );

      expect(result.notifiedUserIds).toEqual(['carol']);
    });
  });

  describe('external channels (D3)', () => {
    beforeEach(() => {
      pushConfigured = true;
      repo.findPushSubscriptionTargets.mockResolvedValue([
        { id: 'sub-1', userId: 'bob' },
        { id: 'sub-2', userId: 'bob' },
      ]);
    });

    it('CHAT_PUSH_ENABLED unset: no push delivery rows are created at all', async () => {
      await service.publishChatMessage(direct());

      expect(repo.findPushSubscriptionTargets).not.toHaveBeenCalled();
      expect(repo.createWithDeliveries.mock.calls[0][0].deliveries).toEqual([]);
      expect(worker.kick).not.toHaveBeenCalled();
    });

    it.each(['false', 'TRUE', '1', ''])(
      'CHAT_PUSH_ENABLED=%j keeps push closed',
      async (value) => {
        env.CHAT_PUSH_ENABLED = value;

        await service.publishChatMessage(direct());

        expect(repo.createWithDeliveries.mock.calls[0][0].deliveries).toEqual(
          [],
        );
      },
    );

    it('flag on but VAPID not configured: no push rows', async () => {
      env.CHAT_PUSH_ENABLED = 'true';
      pushConfigured = false;

      await service.publishChatMessage(direct());

      expect(repo.createWithDeliveries.mock.calls[0][0].deliveries).toEqual([]);
    });

    it('flag on: one DELAYED push per device, never email', async () => {
      env.CHAT_PUSH_ENABLED = 'true';
      env.NOTIFICATIONS_EMAIL_ENABLED = 'true';
      env.CHAT_PUSH_DELAY_MS = '60000';

      const before = Date.now();
      await service.publishChatMessage(direct());
      const after = Date.now();

      const deliveries = repo.createWithDeliveries.mock.calls[0][0].deliveries;

      expect(deliveries.map((d) => [d.channel, d.target])).toEqual([
        ['push', 'sub-1'],
        ['push', 'sub-2'],
      ]);

      for (const delivery of deliveries) {
        const due = delivery.nextAttemptAt!.getTime();
        expect(due).toBeGreaterThanOrEqual(before + 60_000);
        expect(due).toBeLessThanOrEqual(after + 60_000);
      }
    });

    it('uses the default delay when none is configured', async () => {
      env.CHAT_PUSH_ENABLED = 'true';

      const before = Date.now();
      await service.publishChatMessage(direct());

      const due =
        repo.createWithDeliveries.mock.calls[0][0].deliveries[0].nextAttemptAt!;
      expect(due.getTime() - before).toBeGreaterThanOrEqual(45_000);
    });

    it('respects a user who opted out of push', async () => {
      env.CHAT_PUSH_ENABLED = 'true';
      repo.findDisabledChannels.mockResolvedValue([
        { userId: 'bob', channel: 'push' },
      ]);

      await service.publishChatMessage(direct());

      expect(repo.createWithDeliveries.mock.calls[0][0].deliveries).toEqual([]);
    });

    it('a user without devices simply gets the inbox row', async () => {
      env.CHAT_PUSH_ENABLED = 'true';
      repo.findPushSubscriptionTargets.mockResolvedValue([]);

      const result = await service.publishChatMessage(direct());

      expect(result.notifiedUserIds).toEqual(['bob']);
      expect(repo.createWithDeliveries.mock.calls[0][0].deliveries).toEqual([]);
    });

    it('TEAM never creates push or email deliveries, whatever is configured', async () => {
      env.CHAT_PUSH_ENABLED = 'true';
      env.NOTIFICATIONS_EMAIL_ENABLED = 'true';

      await service.publishChatMessage(team());

      expect(repo.createWithDeliveries).not.toHaveBeenCalled();
      expect(repo.findPushSubscriptionTargets).not.toHaveBeenCalled();
      expect(repo.upsertChatTeamNotifications).toHaveBeenCalledTimes(1);
    });
  });

  describe('TEAM', () => {
    it('upserts ONE row per recipient and conversation, with the latest message', async () => {
      const result = await service.publishChatMessage(team());

      expect(result.notifiedUserIds).toEqual(['bob', 'carol']);
      expect(repo.upsertChatTeamNotifications).toHaveBeenCalledWith({
        companyId: COMPANY,
        actorId: 'alice',
        conversationId: 'team-1',
        dedupeKey: 'chat.message:team:team-1',
        params: {
          messageId: 'msg-1',
          sequence: '7',
          conversationType: 'TEAM',
          snippet: 'hello there',
        },
        userIds: ['bob', 'carol'],
      });
    });

    it('drops the sender from the recipients', async () => {
      await service.publishChatMessage(
        team({ recipientIds: ['alice', 'bob', 'bob'] }),
      );

      expect(repo.upsertChatTeamNotifications.mock.calls[0][0].userIds).toEqual(
        ['bob'],
      );
    });

    it('reports only the users whose row was created or advanced', async () => {
      repo.upsertChatTeamNotifications.mockResolvedValue(['carol']);

      const result = await service.publishChatMessage(team());

      expect(result.notifiedUserIds).toEqual(['carol']);
    });

    it('does not call the repository for an empty audience', async () => {
      await service.publishChatMessage(team({ recipientIds: ['alice'] }));

      expect(repo.upsertChatTeamNotifications).not.toHaveBeenCalled();
    });
  });

  describe('failure isolation', () => {
    it('never throws: a repository failure is swallowed and reported as "nobody notified"', async () => {
      repo.upsertChatTeamNotifications.mockRejectedValue(new Error('db down'));
      repo.findEligibleRecipients.mockRejectedValue(new Error('db down'));

      await expect(service.publishChatMessage(team())).resolves.toEqual({
        notifiedUserIds: [],
      });
      await expect(service.publishChatMessage(direct())).resolves.toEqual({
        notifiedUserIds: [],
      });
    });

    it('never logs the message content', async () => {
      const errorSpy = jest
        .spyOn(
          (service as unknown as { logger: { error: jest.Mock } }).logger,
          'error',
        )
        .mockImplementation(() => undefined);

      repo.findEligibleRecipients.mockRejectedValue(
        new Error('failure mentioning SECRET-BODY'),
      );

      await service.publishChatMessage(direct({ body: 'SECRET-BODY' }));

      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).not.toContain('SECRET-BODY');
    });
  });

  describe('markChatConversationRead', () => {
    it('delegates with the exact company / user / conversation / cursor', async () => {
      repo.markChatConversationRead.mockResolvedValue(3);

      await expect(
        service.markChatConversationRead(COMPANY, 'bob', 'dm-1', 9),
      ).resolves.toEqual({ updated: 3 });

      expect(repo.markChatConversationRead).toHaveBeenCalledWith(
        COMPANY,
        'bob',
        'dm-1',
        9,
      );
    });
  });

  describe('inbox rendering', () => {
    it('shows the snippet in the body but does not expose it through params', async () => {
      repo.findManyForUser.mockResolvedValue({
        total: 1,
        items: [
          {
            id: 'n1',
            type: 'chat.message',
            entityType: 'chat_conversation',
            entityId: 'dm-1',
            params: {
              messageId: 'msg-1',
              sequence: '7',
              conversationType: 'DIRECT',
              snippet: 'see you at 5',
            },
            readAt: null,
            createdAt: new Date('2026-10-14T10:00:00Z'),
            actor: { id: 'alice', firstName: 'Alice', lastName: 'Smith' },
          },
        ],
      });
      repo.findUserLanguage.mockResolvedValue('en');

      const page = await service.findAll(COMPANY, 'bob', {
        page: 1,
        limit: 20,
      });

      const [item] = page.data;

      expect(item.title).toBe('New message');
      expect(item.body).toBe('Alice Smith: see you at 5');
      expect(item.path).toBe('/dashboard/chat?c=dm-1');
      expect(item.params).toEqual({});
      expect(item.actor).toEqual({ id: 'alice', name: 'Alice Smith' });
    });

    it('renders Arabic for an Arabic recipient', async () => {
      repo.findManyForUser.mockResolvedValue({
        total: 1,
        items: [
          {
            id: 'n1',
            type: 'chat.message',
            entityType: 'chat_conversation',
            entityId: 'team-1',
            params: {
              messageId: 'm',
              sequence: '3',
              conversationType: 'TEAM',
              snippet: 'مرحبا',
            },
            readAt: null,
            createdAt: new Date('2026-10-14T10:00:00Z'),
            actor: { id: 'a', firstName: 'علي', lastName: 'أحمد' },
          },
        ],
      });
      repo.findUserLanguage.mockResolvedValue('ar');

      const page = await service.findAll(COMPANY, 'bob', {
        page: 1,
        limit: 20,
      });

      expect(page.data[0].title).toBe('رسائل جديدة في دردشة الفريق');
      expect(page.data[0].body).toBe('علي أحمد: مرحبا');
    });
  });

  describe('regression: publish() for the existing types is untouched', () => {
    it('still creates deliveries for task.assigned exactly as before', async () => {
      pushConfigured = true;
      env.NOTIFICATIONS_EMAIL_ENABLED = 'true';
      repo.findPushSubscriptionTargets.mockResolvedValue([
        { id: 'sub-1', userId: 'bob' },
      ]);

      await service.publish({
        type: 'task.assigned',
        companyId: COMPANY,
        actorId: 'alice',
        recipientIds: ['bob'],
        entityType: 'task',
        entityId: 't1',
        title: 'Write report',
        occurrenceId: 'act-1',
      });

      const call = repo.createWithDeliveries.mock.calls[0][0];

      expect(call.dedupeKey).toBe('task.assigned:act-1');
      expect(call.deliveries).toEqual([
        { channel: 'email', target: 'default' },
        { channel: 'push', target: 'sub-1' },
      ]);
      // No delay is ever applied to the existing types.
      expect(call.deliveries.every((d) => d.nextAttemptAt === undefined)).toBe(
        true,
      );
      expect(worker.kick).toHaveBeenCalledTimes(1);
    });
  });
});
