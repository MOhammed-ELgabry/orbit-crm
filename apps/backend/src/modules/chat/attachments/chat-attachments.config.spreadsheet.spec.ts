import {
  CHAT_ATTACHMENTS_ENV_NAMES,
  resolveChatAttachmentsConfig,
} from './chat-attachments.config';
import { DB_CEILINGS } from './chat-attachments.constants';

const ON = { CHAT_ATTACHMENTS_ENABLED: 'true' };
const MIB = 1024 * 1024;

describe('resolveChatAttachmentsConfig - spreadsheet limit', () => {
  it('defaults to 10 MiB and leaves every other limit alone', () => {
    expect(resolveChatAttachmentsConfig(ON)).toMatchObject({
      enabled: true,
      spreadsheetMaxBytes: 10 * MIB,
      imageMaxBytes: 5 * MIB,
      pdfMaxBytes: 10 * MIB,
      maxPendingPerUser: 3,
      maxDailyPerUser: 30,
      companyQuotaBytes: 500 * MIB,
    });
  });

  it('the feature is still OFF by default (the switch is unchanged)', () => {
    expect(resolveChatAttachmentsConfig({})).toMatchObject({
      enabled: false,
      reason: 'flag_off',
    });
  });

  it('is configurable through CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES', () => {
    expect(CHAT_ATTACHMENTS_ENV_NAMES).toContain(
      'CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES',
    );
    expect(
      resolveChatAttachmentsConfig({
        ...ON,
        CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES: String(2 * MIB),
      }),
    ).toMatchObject({
      enabled: true,
      spreadsheetMaxBytes: 2 * MIB,
      pdfMaxBytes: 10 * MIB,
    });
  });

  it('does not change the image or PDF limits when only the spreadsheet limit is set', () => {
    expect(
      resolveChatAttachmentsConfig({
        ...ON,
        CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES: '1000',
      }),
    ).toMatchObject({ imageMaxBytes: 5 * MIB, pdfMaxBytes: 10 * MIB });
  });

  it('fails CLOSED above the database ceiling and names only the variable', () => {
    expect(DB_CEILINGS.spreadsheetBytes).toBe(10 * MIB);
    expect(
      resolveChatAttachmentsConfig({
        ...ON,
        CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES: String(
          DB_CEILINGS.spreadsheetBytes + 1,
        ),
      }),
    ).toEqual({
      enabled: false,
      reason: 'invalid_config',
      detail: 'CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES',
    });
  });

  it.each(['abc', '-5', '0', '1.5', '1e3'])(
    'fails closed for the invalid value %p',
    (value) => {
      expect(
        resolveChatAttachmentsConfig({
          ...ON,
          CHAT_ATTACHMENTS_SPREADSHEET_MAX_BYTES: value,
        }),
      ).toMatchObject({ enabled: false, reason: 'invalid_config' });
    },
  );

  it('still has no company allow-list / block-list variable', () => {
    expect(
      CHAT_ATTACHMENTS_ENV_NAMES.filter((name) =>
        /COMPANY_(ID|IDS)|ALLOW|BLOCK/.test(name),
      ),
    ).toEqual([]);
  });
});
