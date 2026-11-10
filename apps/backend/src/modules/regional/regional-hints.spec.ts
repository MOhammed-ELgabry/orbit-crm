import {
  parseStoredHints,
  sanitizeRegionalHints,
  withIpCountry,
} from './regional-hints';
import {
  canonicalizeLocale,
  isValidIanaTimezone,
} from './regional-timezone.util';

const known = (code: string) =>
  Promise.resolve(['EG', 'SA', 'US'].includes(code));
const NOW = new Date('2026-11-09T00:00:00Z');

describe('isValidIanaTimezone', () => {
  it.each([
    'Africa/Cairo',
    'Asia/Riyadh',
    'America/Argentina/Buenos_Aires',
    'UTC',
  ])('accepts %s', (tz) => expect(isValidIanaTimezone(tz)).toBe(true));
  it.each([
    '+02:00',
    'UTC+2',
    'GMT+3',
    'Etc/GMT+3',
    'Not/AZone',
    '',
    'Africa',
    '../etc/passwd',
    'Africa/Cairo; DROP',
    42,
    null,
    undefined,
  ])('rejects %p', (tz) => expect(isValidIanaTimezone(tz)).toBe(false));
});

describe('canonicalizeLocale', () => {
  it('canonicalises case', () =>
    expect(canonicalizeLocale('AR-eg')).toBe('ar-EG'));
  it.each(['', 'x', 'not a locale!!', 5, null])('rejects %p', (v) =>
    expect(canonicalizeLocale(v)).toBeNull(),
  );
});

describe('sanitizeRegionalHints', () => {
  it('returns null for non-objects and empty objects', async () => {
    for (const v of [null, undefined, 'x', 5, [], {}]) {
      expect(await sanitizeRegionalHints(v, known, NOW)).toBeNull();
    }
  });

  it('keeps valid pieces and drops invalid ones independently', async () => {
    const r = await sanitizeRegionalHints(
      {
        timezone: 'Africa/Cairo',
        locales: ['ar-EG', 'bad locale!!', 'ar-EG', 'en-US'],
        geo: { country: 'eg', accuracyM: 12.6, borderRisk: false },
        ipCountry: 'US', // must never be trusted from the client
        latitude: 30.04, // coordinates must never be kept
        longitude: 31.23,
        extra: 'x',
      },
      known,
      NOW,
    );
    expect(r).toEqual({
      v: 1,
      capturedAt: NOW.toISOString(),
      timezone: 'Africa/Cairo',
      locales: ['ar-EG', 'en-US'],
      geo: { country: 'EG', accuracyM: 13, borderRisk: false },
    });
    expect(JSON.stringify(r)).not.toMatch(/30\.04|31\.23|latitude|longitude/);
  });

  it('drops an unknown geo country and a bad zone but keeps locales', async () => {
    const r = await sanitizeRegionalHints(
      { timezone: 'Mars/Base', geo: { country: 'ZZ' }, locales: ['ar-SA'] },
      known,
      NOW,
    );
    expect(r?.timezone).toBeUndefined();
    expect(r?.geo).toBeUndefined();
    expect(r?.locales).toEqual(['ar-SA']);
  });

  it('caps locales and rejects absurd accuracy', async () => {
    const r = await sanitizeRegionalHints(
      {
        locales: [
          'en-US',
          'en-GB',
          'fr-FR',
          'de-DE',
          'es-ES',
          'it-IT',
          'ja-JP',
        ],
        geo: { country: 'EG', accuracyM: 9e9 },
      },
      known,
      NOW,
    );
    expect(r?.locales).toHaveLength(5);
    expect(r?.geo).toEqual({ country: 'EG', borderRisk: false });
  });

  it('treats borderRisk as false unless it is exactly true', async () => {
    const r = await sanitizeRegionalHints(
      { geo: { country: 'EG', borderRisk: 'true' } },
      known,
      NOW,
    );
    expect(r?.geo?.borderRisk).toBe(false);
  });
});

describe('withIpCountry / parseStoredHints', () => {
  it('adds only well-formed server-resolved codes', () => {
    expect(withIpCountry(null, 'EG', NOW)).toMatchObject({ ipCountry: 'EG' });
    expect(withIpCountry(null, 'egypt', NOW)).toBeNull();
    expect(withIpCountry(null, null, NOW)).toBeNull();
  });

  it('re-validates stored documents and drops tampered content', async () => {
    const r = await parseStoredHints(
      {
        v: 1,
        capturedAt: NOW.toISOString(),
        timezone: 'Africa/Cairo',
        ipCountry: 'ZZ',
        latitude: 1,
      },
      known,
    );
    expect(r).toMatchObject({ timezone: 'Africa/Cairo' });
    expect(r?.ipCountry).toBeUndefined();
    expect(
      await parseStoredHints({ v: 2, timezone: 'Africa/Cairo' }, known),
    ).toBeNull();
    expect(await parseStoredHints('junk', known)).toBeNull();
  });
});
