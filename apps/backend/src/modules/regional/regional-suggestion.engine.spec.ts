import { COUNTRY_SEED } from './data/countries.data';
import type { RegionalHints } from './regional-hints';
import {
  suggestRegionalSettings,
  type SuggestionReference,
} from './regional-suggestion.engine';

const reference: SuggestionReference = {
  getCountryDefaults: (code) => {
    const c = COUNTRY_SEED.find((x) => x.code === code);
    return c
      ? { defaultTimezone: c.defaultTimezone, defaultLocale: c.defaultLocale }
      : null;
  },
};

const hints = (partial: Partial<RegionalHints>): RegionalHints => ({
  v: 1,
  capturedAt: '2026-11-09T00:00:00.000Z',
  ...partial,
});

describe('suggestRegionalSettings', () => {
  it('returns an empty NEEDS_REVIEW suggestion with no hints at all', () => {
    const r = suggestRegionalSettings(null, reference);
    expect(r.countryCode).toBeNull();
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.confidence).toBe('AMBIGUOUS');
  });

  it('GPS + IP + unique timezone agree => HIGH / DETECTED', () => {
    const r = suggestRegionalSettings(
      hints({
        geo: { country: 'EG', borderRisk: false },
        ipCountry: 'EG',
        timezone: 'Africa/Cairo',
        locales: ['ar-EG'],
      }),
      reference,
    );
    expect(r).toMatchObject({
      countryCode: 'EG',
      timezone: 'Africa/Cairo',
      locale: 'ar-EG',
      source: 'GEOLOCATION',
      confidence: 'HIGH',
      status: 'DETECTED',
      conflict: false,
    });
  });

  it('GPS alone is MEDIUM but still DETECTED', () => {
    const r = suggestRegionalSettings(
      hints({ geo: { country: 'SA', borderRisk: false } }),
      reference,
    );
    expect(r.countryCode).toBe('SA');
    expect(r.confidence).toBe('MEDIUM');
    expect(r.status).toBe('DETECTED');
    expect(r.timezone).toBe('Asia/Riyadh');
  });

  it('GPS whose accuracy circle crosses a border contributes nothing', () => {
    const r = suggestRegionalSettings(
      hints({ geo: { country: 'SA', borderRisk: true } }),
      reference,
    );
    expect(r.countryCode).toBeNull();
    expect(r.status).toBe('NEEDS_REVIEW');
  });

  it('a border GPS fix does not override IP + timezone', () => {
    const r = suggestRegionalSettings(
      hints({
        geo: { country: 'SA', borderRisk: true },
        ipCountry: 'AE',
        timezone: 'Asia/Dubai',
      }),
      reference,
    );
    expect(r.countryCode).toBe('AE');
    expect(r.conflict).toBe(false);
  });

  it('IP alone is LOW and needs review', () => {
    const r = suggestRegionalSettings(hints({ ipCountry: 'GB' }), reference);
    expect(r.countryCode).toBe('GB');
    expect(r.confidence).toBe('LOW');
    expect(r.status).toBe('NEEDS_REVIEW');
  });

  it('IP + unique timezone agree => HIGH', () => {
    const r = suggestRegionalSettings(
      hints({ ipCountry: 'EG', timezone: 'Africa/Cairo' }),
      reference,
    );
    expect(r.confidence).toBe('HIGH');
    expect(r.source).toBe('IP');
  });

  it('shared timezone alone cannot choose a country (Gulf: Asia/Riyadh)', () => {
    const r = suggestRegionalSettings(
      hints({ timezone: 'Asia/Riyadh' }),
      reference,
    );
    expect(r.countryCode).toBeNull();
    expect(r.confidence).toBe('AMBIGUOUS');
    expect(r.timezone).toBe('Asia/Riyadh');
  });

  it('shared timezone + IP inside it resolves to the IP country (MEDIUM)', () => {
    const r = suggestRegionalSettings(
      hints({ timezone: 'Asia/Riyadh', ipCountry: 'KW' }),
      reference,
    );
    expect(r.countryCode).toBe('KW');
    expect(r.confidence).toBe('MEDIUM');
  });

  it('VPN case: IP says DE, device zone says Africa/Cairo => ambiguous, no country', () => {
    const r = suggestRegionalSettings(
      hints({ ipCountry: 'DE', timezone: 'Africa/Cairo' }),
      reference,
    );
    expect(r.countryCode).toBeNull();
    expect(r.confidence).toBe('AMBIGUOUS');
    expect(r.status).toBe('NEEDS_REVIEW');
    expect(r.conflict).toBe(true);
  });

  it('locale breaks an IP vs timezone tie only when it clearly leads', () => {
    const r = suggestRegionalSettings(
      hints({
        ipCountry: 'DE',
        timezone: 'Africa/Cairo',
        locales: ['ar-EG', 'en-US'],
      }),
      reference,
    );
    // EG: 2 (tz) + 1 (locale) = 3 ; DE: 2 => margin 1 < 2 => still ambiguous
    expect(r.countryCode).toBeNull();
  });

  it('GPS vs IP+timezone elsewhere stays ambiguous (traveller)', () => {
    const r = suggestRegionalSettings(
      hints({
        geo: { country: 'EG', borderRisk: false },
        ipCountry: 'GB',
        timezone: 'Europe/London',
      }),
      reference,
    );
    expect(r.countryCode).toBeNull();
    expect(r.conflict).toBe(true);
  });

  it('a strong majority beats one contradicting signal but is downgraded + reviewed', () => {
    const r = suggestRegionalSettings(
      hints({
        geo: { country: 'EG', borderRisk: false },
        timezone: 'Africa/Cairo',
        locales: ['ar-EG'],
        ipCountry: 'US',
      }),
      reference,
    );
    // EG: 3+2+1 = 6 ; US: 2 => lead 4
    expect(r.countryCode).toBe('EG');
    expect(r.conflict).toBe(true);
    expect(r.confidence).toBe('MEDIUM');
    expect(r.status).toBe('NEEDS_REVIEW');
  });

  it('ignores locale regions that are not real countries (es-419)', () => {
    const r = suggestRegionalSettings(
      hints({ locales: ['es-419'], timezone: 'America/Mexico_City' }),
      reference,
    );
    expect(r.countryCode).toBe('MX');
  });

  it('replaces a zone that does not belong to the winning country by its default zone', () => {
    const r = suggestRegionalSettings(
      hints({
        geo: { country: 'EG', borderRisk: false },
        timezone: 'Europe/Berlin',
      }),
      reference,
    );
    // Europe/Berlin is shared (weight 1 each): EG 3 vs DE 1 => lead 2.
    expect(r.countryCode).toBe('EG');
    expect(r.conflict).toBe(true);
    expect(r.timezone).toBe('Africa/Cairo');
    const r2 = suggestRegionalSettings(
      hints({
        geo: { country: 'EG', borderRisk: false },
        ipCountry: 'EG',
        timezone: 'Europe/Berlin',
      }),
      reference,
    );
    expect(r2.countryCode).toBe('EG');
    expect(r2.timezone).toBe('Africa/Cairo');
  });

  it('is deterministic', () => {
    const h = hints({ ipCountry: 'EG', timezone: 'Africa/Cairo' });
    expect(suggestRegionalSettings(h, reference)).toEqual(
      suggestRegionalSettings(h, reference),
    );
  });

  it('never returns CONFIRMED', () => {
    const r = suggestRegionalSettings(
      hints({ geo: { country: 'EG', borderRisk: false }, ipCountry: 'EG' }),
      reference,
    );
    expect(r.status).not.toBe('CONFIRMED');
  });
});
