import {
  CHAT_PUSH_DEFAULT_DELAY_MS,
  CHAT_PUSH_MAX_DELAY_MS,
  NOTIFICATION_TYPE_CHANNELS,
} from './constants/notification.constants';
import {
  buildDedupeKey,
  decideDeliveries,
  isChatPushEnabled,
  resolveChatPushDelayMs,
} from './notification.policy';

describe('chat notification policy', () => {
  describe('isChatPushEnabled', () => {
    it('is closed unless the value is exactly "true"', () => {
      expect(isChatPushEnabled(undefined)).toBe(false);
      expect(isChatPushEnabled(null)).toBe(false);
      expect(isChatPushEnabled('')).toBe(false);
      expect(isChatPushEnabled('false')).toBe(false);
      expect(isChatPushEnabled('TRUE')).toBe(false);
      expect(isChatPushEnabled('1')).toBe(false);
      expect(isChatPushEnabled('yes')).toBe(false);
      expect(isChatPushEnabled('true')).toBe(true);
    });
  });

  describe('resolveChatPushDelayMs', () => {
    it('defaults when unset, blank, invalid or negative', () => {
      for (const value of [undefined, null, '', '  ', 'abc', '-5', 'NaN']) {
        expect(resolveChatPushDelayMs(value)).toBe(CHAT_PUSH_DEFAULT_DELAY_MS);
      }
    });

    it('accepts 0 and ordinary values, truncating decimals', () => {
      expect(resolveChatPushDelayMs('0')).toBe(0);
      expect(resolveChatPushDelayMs('30000')).toBe(30_000);
      expect(resolveChatPushDelayMs('1500.9')).toBe(1500);
    });

    it('is capped so a typo cannot outlive the delivery expiry', () => {
      expect(resolveChatPushDelayMs('99999999999')).toBe(
        CHAT_PUSH_MAX_DELAY_MS,
      );
      expect(CHAT_PUSH_MAX_DELAY_MS).toBeLessThan(24 * 60 * 60 * 1000);
    });
  });

  describe('chat.message channels', () => {
    it('never emails, even if the deployment email flag is on', () => {
      expect(NOTIFICATION_TYPE_CHANNELS['chat.message'].email).toBe(false);

      const deliveries = decideDeliveries({
        type: 'chat.message',
        emailEnabledGlobally: true,
        pushAvailable: false,
        disabledChannels: new Set(),
        pushSubscriptionIds: ['s1'],
      });

      expect(deliveries).toEqual([]);
    });

    it('pushes to every device only when push is available and not opted out', () => {
      const input = {
        type: 'chat.message' as const,
        emailEnabledGlobally: false,
        pushAvailable: true,
        pushSubscriptionIds: ['s1', 's2'],
      };

      expect(
        decideDeliveries({ ...input, disabledChannels: new Set() }),
      ).toEqual([
        { channel: 'push', target: 's1' },
        { channel: 'push', target: 's2' },
      ]);

      expect(
        decideDeliveries({ ...input, disabledChannels: new Set(['push']) }),
      ).toEqual([]);
    });

    it('a user with no device gets no push delivery', () => {
      expect(
        decideDeliveries({
          type: 'chat.message',
          emailEnabledGlobally: false,
          pushAvailable: true,
          disabledChannels: new Set(),
          pushSubscriptionIds: [],
        }),
      ).toEqual([]);
    });
  });

  it('DIRECT and TEAM dedupe keys can never collide', () => {
    const direct = buildDedupeKey('chat.message', 'msg123');
    const team = buildDedupeKey('chat.message', 'team:conv123');

    expect(direct).toBe('chat.message:msg123');
    expect(team).toBe('chat.message:team:conv123');
    expect(direct).not.toBe(team);
  });
});
