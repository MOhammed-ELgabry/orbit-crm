/* eslint-disable @typescript-eslint/unbound-method -- jest mocks are asserted through detached method references */
import type { ConfigService } from '@nestjs/config';

import type { MailService } from '../mail/mail.service';

import { NotificationWorker } from './notification.worker';
import type {
  ClaimedDelivery,
  DeliveryContext,
  INotificationRepository,
} from './repository/notification.repository.interface';
import { PushSendError } from './web-push.service';
import type { PushPayload } from './notification.templates';
import type { WebPushService } from './web-push.service';

type Repo = jest.Mocked<INotificationRepository>;

const NOW = new Date('2026-10-14T10:00:00.000Z');

function makeRepository(): Repo {
  const names: Array<keyof INotificationRepository> = [
    'loadDeliveryContext',
    'markDeliverySent',
    'markDeliverySkipped',
    'markDeliveryFailed',
    'scheduleDeliveryRetry',
    'deferDelivery',
    'getChannelPreferences',
    'findPushSubscriptionForSend',
    'hasActiveSession',
    'recordPushSuccess',
    'recordPushFailure',
    'deletePushSubscriptionById',
    'countEmailsSentSince',
  ];
  const repo: Partial<Record<keyof INotificationRepository, jest.Mock>> = {};
  for (const name of names) repo[name] = jest.fn();

  const r = repo as Repo;
  r.getChannelPreferences.mockResolvedValue({});
  r.hasActiveSession.mockResolvedValue(true);
  r.findPushSubscriptionForSend.mockResolvedValue({
    id: 'sub-1',
    companyId: 'company-a',
    userId: 'bob',
    endpoint: 'https://push.example/abc',
    p256dh: 'p',
    auth: 'a',
  });
  return r;
}

function context(
  overrides: {
    type?: string;
    readAt?: Date | null;
    entityId?: string;
    params?: unknown;
  } = {},
): DeliveryContext {
  return {
    delivery: { id: 'd1', channel: 'push', target: 'sub-1', attempts: 1 },
    notification: {
      id: 'n1',
      companyId: 'company-a',
      userId: 'bob',
      type: overrides.type ?? 'chat.message',
      entityType: 'chat_conversation',
      entityId: overrides.entityId ?? 'dm-1',
      params: overrides.params ?? {
        messageId: 'm1',
        sequence: '4',
        conversationType: 'DIRECT',
        snippet: 'TOP SECRET CONTENT',
      },
      createdAt: new Date(NOW.getTime() - 60_000),
      readAt: overrides.readAt ?? null,
      actor: { firstName: 'Alice', lastName: 'Smith' },
    },
    recipient: {
      id: 'bob',
      email: 'bob@example.test',
      language: 'en',
      companyId: 'company-a',
      isActive: true,
      deletedAt: null,
    },
  };
}

const claimed = (channel = 'push'): ClaimedDelivery => ({
  id: 'd1',
  notificationId: 'n1',
  channel,
  target: channel === 'push' ? 'sub-1' : 'default',
  attempts: 1,
});

describe('NotificationWorker - chat rules', () => {
  let repo: Repo;
  let env: Record<string, string | undefined>;
  let send: jest.Mock<Promise<void>, [unknown, PushPayload]>;
  let sendEmail: jest.Mock;
  let worker: NotificationWorker;

  beforeEach(() => {
    repo = makeRepository();
    env = { CHAT_PUSH_ENABLED: 'true', NOTIFICATIONS_EMAIL_ENABLED: 'true' };
    send = jest
      .fn<Promise<void>, [unknown, PushPayload]>()
      .mockResolvedValue(undefined);
    sendEmail = jest.fn().mockResolvedValue(undefined);

    worker = new NotificationWorker(
      repo,
      { get: (key: string) => env[key] } as unknown as ConfigService,
      { sendNotificationEmail: sendEmail } as unknown as MailService,
      { isConfigured: () => true, send } as unknown as WebPushService,
    );
  });

  const run = async (ctx: DeliveryContext, channel = 'push') => {
    repo.loadDeliveryContext.mockResolvedValue(ctx);
    await worker.processDelivery(claimed(channel), NOW);
  };

  it('sends an unread DIRECT chat push, without any message text', async () => {
    await run(context());

    expect(send).toHaveBeenCalledTimes(1);
    const [, payload] = send.mock.calls[0];

    expect(JSON.stringify(payload)).not.toContain('TOP SECRET');
    expect(payload).toEqual({
      title: 'New message',
      body: 'Alice Smith sent you a message.',
      path: '/dashboard/chat?c=dm-1',
      tag: 'chat-dm-1',
    });
    expect(repo.markDeliverySent).toHaveBeenCalledWith('d1', 1, NOW);
  });

  it('skips the push when the notification was read during the delay', async () => {
    await run(context({ readAt: new Date(NOW.getTime() - 5_000) }));

    expect(send).not.toHaveBeenCalled();
    expect(repo.markDeliverySkipped).toHaveBeenCalledWith(
      'd1',
      1,
      'already_read',
    );
  });

  it.each([undefined, '', 'false', 'TRUE'])(
    'skips queued chat pushes when CHAT_PUSH_ENABLED=%j at send time',
    async (value) => {
      env.CHAT_PUSH_ENABLED = value;

      await run(context());

      expect(send).not.toHaveBeenCalled();
      expect(repo.markDeliverySkipped).toHaveBeenCalledWith(
        'd1',
        1,
        'channel_disabled',
      );
    },
  );

  it('never sends a chat EMAIL, even if such a row existed', async () => {
    await run(context(), 'email');

    expect(sendEmail).not.toHaveBeenCalled();
    expect(repo.markDeliverySkipped).toHaveBeenCalledWith(
      'd1',
      1,
      'channel_disabled',
    );
  });

  it("still honours the user's push preference at send time", async () => {
    repo.getChannelPreferences.mockResolvedValue({ push: false });

    await run(context());

    expect(send).not.toHaveBeenCalled();
    expect(repo.markDeliverySkipped).toHaveBeenCalledWith(
      'd1',
      1,
      'preference_disabled',
    );
  });

  it('a missing device is skipped, not an error', async () => {
    repo.findPushSubscriptionForSend.mockResolvedValue(null);

    await run(context());

    expect(repo.markDeliverySkipped).toHaveBeenCalledWith(
      'd1',
      1,
      'subscription_gone',
    );
  });

  it('a provider failure schedules a retry and never throws (message and inbox row untouched)', async () => {
    send.mockRejectedValue(new PushSendError('network_error'));

    await expect(run(context())).resolves.toBeUndefined();

    expect(repo.recordPushFailure).toHaveBeenCalled();
    expect(repo.scheduleDeliveryRetry).toHaveBeenCalledTimes(1);
    expect(repo.markDeliverySent).not.toHaveBeenCalled();
  });

  describe('other notification types are unaffected', () => {
    it('a read task.assigned push is still sent, and CHAT_PUSH_ENABLED is irrelevant', async () => {
      env.CHAT_PUSH_ENABLED = undefined;

      await run(
        context({
          type: 'task.assigned',
          readAt: new Date(NOW.getTime() - 1000),
          params: { title: 'Write report' },
        }),
      );

      expect(send).toHaveBeenCalledTimes(1);
      const [, payload] = send.mock.calls[0];

      expect(payload.tag).toBe('notification-n1');
      expect(payload.body).toContain('Write report');
      expect(repo.markDeliverySkipped).not.toHaveBeenCalled();
      expect(repo.markDeliverySent).toHaveBeenCalledTimes(1);
    });
  });
});
