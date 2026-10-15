import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MarkReadDto } from './mark-read.dto';
import { MessagesQueryDto } from './messages-query.dto';
import { OpenDirectConversationDto } from './open-direct.dto';
import { ReceiptsQueryDto } from './receipts-query.dto';
import { normalizeMessageBody, SendMessageDto } from './send-message.dto';
import { TeammatesQueryDto } from './teammates-query.dto';

async function check<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { instance, errors: errors.map((e) => e.property) };
}

const CLIENT_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('normalizeMessageBody', () => {
  it('removes NULs and control characters but keeps tab and newlines', () => {
    expect(normalizeMessageBody('a\u0000b\u0007c\u007Fd\te\nf')).toBe(
      'abcd\te\nf',
    );
  });

  it('normalises CRLF/CR and trims', () => {
    expect(normalizeMessageBody('  a\r\nb\rc  ')).toBe('a\nb\nc');
  });

  it('keeps Arabic text, emoji and markup characters as plain text', () => {
    const text = 'مرحبا 👋 <script>alert(1)</script>';
    expect(normalizeMessageBody(text)).toBe(text);
  });
});

describe('SendMessageDto', () => {
  it('accepts a valid message', async () => {
    const { errors, instance } = await check(SendMessageDto, {
      clientMessageId: CLIENT_ID,
      body: '  hello  ',
    });

    expect(errors).toEqual([]);
    expect(instance.body).toBe('hello');
  });

  it.each([
    ['empty body', { clientMessageId: CLIENT_ID, body: '' }, 'body'],
    [
      'whitespace-only body',
      { clientMessageId: CLIENT_ID, body: ' \n\t ' },
      'body',
    ],
    [
      'control-only body',
      { clientMessageId: CLIENT_ID, body: '\u0000\u0001' },
      'body',
    ],
    [
      'too long body',
      { clientMessageId: CLIENT_ID, body: 'x'.repeat(4001) },
      'body',
    ],
    ['non-string body', { clientMessageId: CLIENT_ID, body: 5 }, 'body'],
    ['missing clientMessageId', { body: 'hi' }, 'clientMessageId'],
    [
      'short clientMessageId',
      { clientMessageId: 'abc', body: 'hi' },
      'clientMessageId',
    ],
    [
      'unsafe clientMessageId',
      { clientMessageId: "x'; DROP TABLE--", body: 'hi' },
      'clientMessageId',
    ],
  ])('rejects %s', async (_name, plain, property) => {
    const { errors } = await check(SendMessageDto, plain);
    expect(errors).toContain(property);
  });

  it('accepts exactly the maximum length', async () => {
    const { errors } = await check(SendMessageDto, {
      clientMessageId: CLIENT_ID,
      body: 'x'.repeat(4000),
    });
    expect(errors).toEqual([]);
  });

  it.each([
    'senderId',
    'companyId',
    'conversationId',
    'sequence',
    'audienceEpoch',
  ])(
    'rejects client-supplied %s (identities are never trusted)',
    async (extra) => {
      const { errors } = await check(SendMessageDto, {
        clientMessageId: CLIENT_ID,
        body: 'hi',
        [extra]: 'forged',
      });
      expect(errors).toContain(extra);
    },
  );
});

describe('MessagesQueryDto', () => {
  it('defaults the page size and parses numeric strings', async () => {
    const { instance, errors } = await check(MessagesQueryDto, {
      before: '10',
    });

    expect(errors).toEqual([]);
    expect(instance.before).toBe(10);
    expect(instance.limit).toBe(30);
  });

  it.each([
    [{ limit: '0' }, 'limit'],
    [{ limit: '51' }, 'limit'],
    [{ before: '0' }, 'before'],
    [{ after: '-1' }, 'after'],
    [{ before: 'abc' }, 'before'],
    [{ before: '1.5' }, 'before'],
  ])('rejects %p', async (plain, property) => {
    const { errors } = await check(MessagesQueryDto, plain);
    expect(errors).toContain(property);
  });

  it('allows after=0 (initial recovery)', async () => {
    const { errors } = await check(MessagesQueryDto, { after: '0' });
    expect(errors).toEqual([]);
  });
});

describe('ReceiptsQueryDto', () => {
  it('requires both bounds', async () => {
    expect(
      (await check(ReceiptsQueryDto, { from: '1', to: '5' })).errors,
    ).toEqual([]);
    expect((await check(ReceiptsQueryDto, { from: '1' })).errors).toContain(
      'to',
    );
    expect((await check(ReceiptsQueryDto, { to: '1' })).errors).toContain(
      'from',
    );
    expect(
      (await check(ReceiptsQueryDto, { from: '0', to: '1' })).errors,
    ).toContain('from');
  });
});

describe('MarkReadDto', () => {
  it('accepts positive integers only', async () => {
    expect((await check(MarkReadDto, { upToSequence: 3 })).errors).toEqual([]);
    expect((await check(MarkReadDto, { upToSequence: 0 })).errors).toContain(
      'upToSequence',
    );
    expect((await check(MarkReadDto, { upToSequence: 1.2 })).errors).toContain(
      'upToSequence',
    );
    expect((await check(MarkReadDto, { upToSequence: '3' })).errors).toContain(
      'upToSequence',
    );
  });
});

describe('OpenDirectConversationDto', () => {
  it('accepts a user id and nothing else', async () => {
    expect(
      (await check(OpenDirectConversationDto, { userId: 'cmabc123_-' })).errors,
    ).toEqual([]);
    expect(
      (
        await check(OpenDirectConversationDto, {
          userId: 'x',
          companyId: 'other',
        })
      ).errors,
    ).toContain('companyId');
  });

  it.each(['', 'a b', 'a/b', "a'b", 'x'.repeat(65)])(
    'rejects userId %p',
    async (userId) => {
      expect(
        (await check(OpenDirectConversationDto, { userId })).errors,
      ).toContain('userId');
    },
  );
});

describe('TeammatesQueryDto', () => {
  it('trims the search and caps its length', async () => {
    const ok = await check(TeammatesQueryDto, { search: '  mona ' });
    expect(ok.errors).toEqual([]);
    expect(ok.instance.search).toBe('mona');

    expect(
      (await check(TeammatesQueryDto, { search: 'x'.repeat(81) })).errors,
    ).toContain('search');
  });
});
