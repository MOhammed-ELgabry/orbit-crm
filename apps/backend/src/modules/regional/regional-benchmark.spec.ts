/**
 * Benchmark of the country-suggestion pipeline. Numbers are written to
 * BENCH_OUT (JSON) when set so the final report can quote them.
 *
 * What this measures and what it does NOT:
 *  - timezone table: REAL data (IANA/CLDR zone -> country table shipped in
 *    data/timezone-countries.data.ts).
 *  - engine scenarios: the engine's DECISION LOGIC over simulated signal
 *    sets built from real per-country defaults (zone, locale). The simulated
 *    IP / GPS values are, by construction, either right or deliberately wrong
 *    (VPN, travel); they say nothing about how often real IP databases or real
 *    GPS chips are wrong — that is measured separately (GPS resolver: the
 *    frontend countryBenchmark test; IP database: the GEOIP_TEST_DB smoke test).
 */
import { existsSync, writeFileSync } from 'fs';

import { COUNTRY_SEED } from './data/countries.data';
import { TIMEZONE_COUNTRIES } from './data/timezone-countries.data';
import type { RegionalHints } from './regional-hints';
import {
  suggestRegionalSettings,
  type RegionalSuggestion,
} from './regional-suggestion.engine';
import { IpCountryService } from './ip-country.service';

const reference = {
  getCountryDefaults: (code: string) => {
    const c = COUNTRY_SEED.find((x) => x.code === code);
    return c
      ? { defaultTimezone: c.defaultTimezone, defaultLocale: c.defaultLocale }
      : null;
  },
};

const BENCH_COUNTRIES = [
  'EG',
  'SA',
  'AE',
  'KW',
  'QA',
  'BH',
  'OM',
  'JO',
  'LB',
  'IQ',
  'YE',
  'MA',
  'GB',
  'US',
  'FR',
  'DE',
  'ES',
  'IT',
  'NL',
  'BE',
  'PT',
  'IE',
  'AT',
  'PL',
  'SE',
  'GR',
  'TR',
  'CH',
  'SG',
  'JP',
  'IN',
  'CN',
  'BR',
  'AR',
  'MX',
  'CA',
  'AU',
  'ZA',
  'NG',
  'KE',
];
// Another country with a different zone, used to simulate a wrong IP (VPN).
const VPN_EXIT = (c: string) => (c === 'DE' ? 'US' : 'DE');

type Outcome = 'correct' | 'no_country' | 'wrong';
const outcome = (s: RegionalSuggestion, truth: string): Outcome =>
  s.countryCode === null
    ? 'no_country'
    : s.countryCode === truth
      ? 'correct'
      : 'wrong';

describe('suggestion pipeline benchmark', () => {
  const result: Record<string, unknown> = {};

  it('timezone table: how often a zone identifies a single country (real data)', () => {
    const zones = Object.values(TIMEZONE_COUNTRIES);
    const unique = zones.filter((c) => c.length === 1).length;
    const countriesWithZones = new Set(zones.flat());
    const exclusive = [...countriesWithZones].filter((code) => {
      const mine = Object.values(TIMEZONE_COUNTRIES).filter((c) =>
        c.includes(code),
      );
      return mine.every((c) => c.length === 1);
    });
    const perCountryDefault = COUNTRY_SEED.filter((c) => c.defaultTimezone).map(
      (c) => ({
        code: c.code,
        unique:
          (TIMEZONE_COUNTRIES[c.defaultTimezone as string] ?? []).length === 1,
      }),
    );
    const gulf = ['SA', 'KW', 'BH', 'QA', 'AE', 'OM', 'YE'].map((c) => ({
      code: c,
      zone: COUNTRY_SEED.find((x) => x.code === c)?.defaultTimezone,
      sharedWith: (
        TIMEZONE_COUNTRIES[
          COUNTRY_SEED.find((x) => x.code === c)?.defaultTimezone as string
        ] ?? []
      ).filter((x) => x !== c),
    }));
    result.timezoneTable = {
      zonesTotal: zones.length,
      zonesMappingToExactlyOneCountry: unique,
      countriesWithAnyZone: countriesWithZones.size,
      countriesWhoseEveryZoneIsExclusive: exclusive.length,
      countriesWithDefaultZone: perCountryDefault.length,
      defaultZoneUniqueToCountry: perCountryDefault.filter((x) => x.unique)
        .length,
      gulfSharedZones: gulf,
    };
    expect(unique).toBeGreaterThan(0);
  });

  it('engine scenarios over 40 countries', () => {
    const scenarios: Record<
      string,
      (c: (typeof COUNTRY_SEED)[number]) => RegionalHints
    > = {
      'S1 GPS + IP + timezone + locale (all correct)': (c) => ({
        v: 1,
        capturedAt: 'x',
        geo: { country: c.code, accuracyM: 20, borderRisk: false },
        ipCountry: c.code,
        timezone: c.defaultTimezone as string,
        locales: c.defaultLocale ? [c.defaultLocale] : [],
      }),
      'S2 GPS denied: IP + timezone + locale': (c) => ({
        v: 1,
        capturedAt: 'x',
        ipCountry: c.code,
        timezone: c.defaultTimezone as string,
        locales: c.defaultLocale ? [c.defaultLocale] : [],
      }),
      'S3 GPS denied, no IP database: timezone + locale only': (c) => ({
        v: 1,
        capturedAt: 'x',
        timezone: c.defaultTimezone as string,
        locales: c.defaultLocale ? [c.defaultLocale] : [],
      }),
      'S4 GPS only': (c) => ({
        v: 1,
        capturedAt: 'x',
        geo: { country: c.code, accuracyM: 20, borderRisk: false },
      }),
      'S5 VPN: IP in another country, own timezone + locale, GPS denied': (
        c,
      ) => ({
        v: 1,
        capturedAt: 'x',
        ipCountry: VPN_EXIT(c.code),
        timezone: c.defaultTimezone as string,
        locales: c.defaultLocale ? [c.defaultLocale] : [],
      }),
      'S6 VPN + GPS allowed (GPS truthful)': (c) => ({
        v: 1,
        capturedAt: 'x',
        ipCountry: VPN_EXIT(c.code),
        geo: { country: c.code, accuracyM: 20, borderRisk: false },
        timezone: c.defaultTimezone as string,
        locales: c.defaultLocale ? [c.defaultLocale] : [],
      }),
      'S7 GPS fix inside border-risk radius + timezone + locale': (c) => ({
        v: 1,
        capturedAt: 'x',
        geo: { country: c.code, accuracyM: 3000, borderRisk: true },
        timezone: c.defaultTimezone as string,
        locales: c.defaultLocale ? [c.defaultLocale] : [],
      }),
    };

    const countries = BENCH_COUNTRIES.map((code) =>
      COUNTRY_SEED.find((c) => c.code === code)!,
    ).filter((c) => c.defaultTimezone);
    result.engineCountries = countries.map((c) => c.code);

    const table: Record<string, unknown> = {};
    for (const [name, build] of Object.entries(scenarios)) {
      const counts: Record<Outcome, number> = {
        correct: 0,
        no_country: 0,
        wrong: 0,
      };
      const conf: Record<string, number> = {};
      const needsReview: number[] = [];
      const wrongList: string[] = [];
      for (const c of countries) {
        const s = suggestRegionalSettings(build(c), reference);
        const o = outcome(s, c.code);
        counts[o]++;
        if (o === 'wrong') wrongList.push(`${c.code}->${s.countryCode}`);
        conf[s.confidence] = (conf[s.confidence] ?? 0) + 1;
        needsReview.push(s.status === 'NEEDS_REVIEW' ? 1 : 0);
        expect(s.status).not.toBe('CONFIRMED');
      }
      table[name] = {
        n: countries.length,
        ...counts,
        wrong: wrongList,
        confidence: conf,
        needsReview: needsReview.reduce((a, b) => a + b, 0),
      };
    }
    result.engineScenarios = table;

    // Safety properties that must hold for every country.
    const wrongTotal = (Object.values(table) as { wrong: string[] }[]).reduce(
      (a: number, t) => a + t.wrong.length,
      0,
    );
    // The engine may leave a country unset, but with truthful own-device
    // signals (all scenarios except the VPN ones) it must never name the wrong one.
    const honest = ['S1', 'S2', 'S3', 'S4', 'S7'];
    for (const [name, t] of Object.entries(table)) {
      if (honest.some((p) => name.startsWith(p))) {
        expect((t as { wrong: string[] }).wrong).toEqual([]);
      }
    }
    result.wrongTotalIncludingVpnScenarios = wrongTotal;
  });

  it('writes results', () => {
    if (process.env.BENCH_OUT) {
      writeFileSync(process.env.BENCH_OUT, JSON.stringify(result, null, 2));
    }
    expect(result.timezoneTable).toBeDefined();
  });
});

/** Smoke test of the real IP database (see ip-country.service.spec.ts). */
const realDb = process.env.GEOIP_TEST_DB;
(realDb && existsSync(realDb) ? describe : describe.skip)(
  'IP database smoke test (public reference addresses)',
  () => {
    // Well-known public allocations / vendor test vectors. A small sample:
    // it checks the database is wired and sane, it is NOT an accuracy rate.
    const REF: Array<[string, string]> = [
      ['8.8.8.8', 'US'],
      ['199.7.83.42', 'US'],
      ['192.5.5.241', 'US'],
      ['193.0.14.129', 'NL'],
      ['81.2.69.142', 'GB'],
      ['2.125.160.216', 'GB'],
      ['89.160.20.112', 'SE'],
      ['202.196.224.0', 'PH'],
      ['67.43.156.0', 'BT'],
      ['175.16.199.0', 'CN'],
      ['216.160.83.56', 'US'],
      ['2a00:1450:4001:81b::200e', 'IE'],
    ];

    it('reports agreement', async () => {
      const svc = new IpCountryService({ get: () => realDb } as never);
      await svc.onModuleInit();
      const rows: { ip: string; expected: string; got: string | null }[] = [];
      for (const [ip, expected] of REF) {
        rows.push({ ip, expected, got: await svc.resolveCountry(ip) });
      }
      const agree = rows.filter((r) => r.got === r.expected).length;
      if (process.env.BENCH_IP_OUT) {
        writeFileSync(
          process.env.BENCH_IP_OUT,
          JSON.stringify({ agree, total: rows.length, rows }, null, 2),
        );
      }
      expect(rows.every((r) => r.got !== null)).toBe(true);
    });
  },
);
