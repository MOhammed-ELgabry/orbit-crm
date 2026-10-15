import {
  errorName,
  fullName,
  isRetryableTransactionError,
  isUniqueViolation,
  newChatId,
  parseCookieHeader,
} from './chat.utils';

describe('chat.utils', () => {
  describe('newChatId', () => {
    it('returns distinct UUIDs', () => {
      const a = newChatId();
      const b = newChatId();

      expect(a).toMatch(/^[0-9a-f-]{36}$/);
      expect(a).not.toBe(b);
    });
  });

  describe('fullName', () => {
    it('joins and normalises whitespace', () => {
      expect(fullName('Mona', 'Ali')).toBe('Mona Ali');
      expect(fullName('  Mona ', ' Ali  ')).toBe('Mona Ali');
      expect(fullName('Mona', '')).toBe('Mona');
      expect(fullName('', '')).toBe('');
    });
  });

  describe('parseCookieHeader', () => {
    it('parses name=value pairs', () => {
      expect(
        parseCookieHeader('a=1; b=two; orbit_access_token=abc.def.ghi'),
      ).toEqual({ a: '1', b: 'two', orbit_access_token: 'abc.def.ghi' });
    });

    it('URI-decodes, strips quotes, keeps malformed escapes verbatim', () => {
      expect(parseCookieHeader('a=%D9%85; b="quoted"; c=%E0%A4%A')).toEqual({
        a: 'م',
        b: 'quoted',
        c: '%E0%A4%A',
      });
    });

    it('keeps the FIRST occurrence of a duplicated name', () => {
      expect(parseCookieHeader('t=first; t=second')).toEqual({ t: 'first' });
    });

    it('ignores nameless/valueless parts and handles empty input', () => {
      expect(parseCookieHeader(undefined)).toEqual({});
      expect(parseCookieHeader('')).toEqual({});
      expect(parseCookieHeader('=novalue; justtext; ok=1')).toEqual({
        ok: '1',
      });
    });

    it('refuses oversized headers instead of parsing them', () => {
      expect(parseCookieHeader(`a=${'x'.repeat(9000)}`)).toEqual({});
    });

    it('does not allow prototype pollution through cookie names', () => {
      const parsed = parseCookieHeader('__proto__=polluted; constructor=x');

      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    });
  });

  describe('isRetryableTransactionError', () => {
    it.each([
      ['Prisma P2034', { code: 'P2034' }],
      ['meta 40001', { meta: { code: '40001' } }],
      ['meta 40P01', { meta: { code: '40P01' } }],
      ['message: serialization', { message: 'could not serialize access' }],
      ['message: deadlock', { message: 'deadlock detected' }],
      [
        'message: stale epoch trigger',
        { message: 'team audience epoch is stale or missing' },
      ],
      ['nested cause', { cause: { code: 'P2034' } }],
    ])('treats %s as retryable', (_name, error) => {
      expect(isRetryableTransactionError(error)).toBe(true);
    });

    it.each([
      ['null', null],
      ['string', 'boom'],
      ['plain error', new Error('something else')],
      ['unique violation', { code: 'P2002' }],
      ['not eligible', { message: 'sender is not eligible' }],
    ])('does not retry %s', (_name, error) => {
      expect(isRetryableTransactionError(error)).toBe(false);
    });
  });

  describe('isUniqueViolation', () => {
    it.each([
      ['P2002', { code: 'P2002' }],
      ['meta 23505', { meta: { code: '23505' } }],
      [
        'message',
        { message: 'duplicate key value violates unique constraint "x"' },
      ],
      ['nested cause', { cause: { code: 'P2002' } }],
    ])('detects %s', (_name, error) => {
      expect(isUniqueViolation(error)).toBe(true);
    });

    it.each([[null], ['x'], [{ code: 'P2025' }], [new Error('nope')]])(
      'rejects %p',
      (error) => {
        expect(isUniqueViolation(error)).toBe(false);
      },
    );
  });

  describe('errorName', () => {
    it('never exposes the message', () => {
      expect(errorName(new TypeError('secret user text'))).toBe('TypeError');
      expect(errorName('str')).toBe('string');
    });
  });
});
