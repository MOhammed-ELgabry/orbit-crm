import {
  CHAT_ATTACHMENTS_ENV_NAMES,
  isAcceptableStorageDir,
  resolveChatAttachmentsConfig,
} from './chat-attachments.config';
import {
  ATTACHMENT_DEFAULTS,
  DB_CEILINGS,
  DEFAULT_STORAGE_DIR,
} from './chat-attachments.constants';

describe('resolveChatAttachmentsConfig', () => {
  it('is OFF by default (nothing set)', () => {
    expect(resolveChatAttachmentsConfig({})).toEqual({
      enabled: false,
      reason: 'flag_off',
    });
  });

  it.each(['false', 'FALSE', 'True', 'TRUE', '1', 'yes', 'on', ''])(
    'stays OFF for the switch value %p (only exactly "true" enables)',
    (value) => {
      expect(
        resolveChatAttachmentsConfig({ CHAT_ATTACHMENTS_ENABLED: value }),
      ).toMatchObject({ enabled: false, reason: 'flag_off' });
    },
  );

  it('is ON for every company: there is no company-specific variable', () => {
    expect(
      CHAT_ATTACHMENTS_ENV_NAMES.filter((name) =>
        /COMPANY_(ID|IDS)|ALLOW|BLOCK/.test(name),
      ),
    ).toEqual([]);

    const config = resolveChatAttachmentsConfig({
      CHAT_ATTACHMENTS_ENABLED: 'true',
    });

    expect(config).toMatchObject({
      enabled: true,
      storageDir: DEFAULT_STORAGE_DIR,
      imageMaxBytes: 5 * 1024 * 1024,
      pdfMaxBytes: 10 * 1024 * 1024,
      maxPendingPerUser: 3,
      maxDailyPerUser: 30,
      companyQuotaBytes: 500 * 1024 * 1024,
    });
  });

  it('applies valid overrides', () => {
    const config = resolveChatAttachmentsConfig({
      CHAT_ATTACHMENTS_ENABLED: 'true',
      CHAT_ATTACHMENTS_DIR: '/data/attachments',
      CHAT_ATTACHMENTS_MAX_PENDING_PER_USER: '2',
      CHAT_ATTACHMENTS_IMAGE_MAX_BYTES: '1048576',
    });

    expect(config).toMatchObject({
      enabled: true,
      storageDir: '/data/attachments',
      maxPendingPerUser: 2,
      imageMaxBytes: 1_048_576,
    });
  });

  it('fails CLOSED when a limit exceeds the database ceilings', () => {
    const config = resolveChatAttachmentsConfig({
      CHAT_ATTACHMENTS_ENABLED: 'true',
      CHAT_ATTACHMENTS_IMAGE_MAX_BYTES: String(DB_CEILINGS.imageBytes + 1),
    });

    expect(config).toEqual({
      enabled: false,
      reason: 'invalid_config',
      detail: 'CHAT_ATTACHMENTS_IMAGE_MAX_BYTES',
    });
  });

  it.each(['abc', '-5', '1.5', '0x10', '1e3', '99999999999999999999'])(
    'fails closed on a malformed number (%p)',
    (value) => {
      const config = resolveChatAttachmentsConfig({
        CHAT_ATTACHMENTS_ENABLED: 'true',
        CHAT_ATTACHMENTS_MAX_DAILY_PER_USER: value,
      });

      expect(config).toMatchObject({
        enabled: false,
        reason: 'invalid_config',
      });
    },
  );

  it.each(['relative/path', '/', '/data/../etc', 'C:relative'])(
    'fails closed on an unsafe storage directory (%p)',
    (dir) => {
      const config = resolveChatAttachmentsConfig({
        CHAT_ATTACHMENTS_ENABLED: 'true',
        CHAT_ATTACHMENTS_DIR: dir,
      });

      expect(config).toMatchObject({
        enabled: false,
        reason: 'invalid_config',
        detail: 'CHAT_ATTACHMENTS_DIR',
      });
    },
  );

  it('names only the offending variables, never their values', () => {
    const secretLooking = '/etc/../super-secret-path';
    const config = resolveChatAttachmentsConfig({
      CHAT_ATTACHMENTS_ENABLED: 'true',
      CHAT_ATTACHMENTS_DIR: secretLooking,
      CHAT_ATTACHMENTS_READY_TTL_MS: 'nope',
    });

    expect(JSON.stringify(config)).not.toContain('super-secret');
    expect(config).toMatchObject({
      detail: expect.stringContaining(
        'CHAT_ATTACHMENTS_READY_TTL_MS',
      ) as string,
    });
  });

  it('exposes the defaults as documented', () => {
    expect(ATTACHMENT_DEFAULTS.maxPendingPerUser).toBe(3);
    expect(ATTACHMENT_DEFAULTS.maxDailyPerUser).toBe(30);
  });
});

describe('isAcceptableStorageDir', () => {
  it('accepts absolute, non-root directories without ".." segments', () => {
    expect(isAcceptableStorageDir('/var/lib/orbit-crm/chat-attachments')).toBe(
      true,
    );
  });

  it('refuses root, relative paths and traversal', () => {
    expect(isAcceptableStorageDir('/')).toBe(false);
    expect(isAcceptableStorageDir('data')).toBe(false);
    expect(isAcceptableStorageDir('/a/../b')).toBe(false);
  });
});
