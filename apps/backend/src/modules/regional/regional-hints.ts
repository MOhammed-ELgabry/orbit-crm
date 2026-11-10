import { REGIONAL_HINTS_VERSION, REGIONAL_LIMITS } from './regional.constants';
import {
  canonicalizeLocale,
  isValidIanaTimezone,
} from './regional-timezone.util';

/**
 * The only shape that is ever persisted (temporarily, on User.regionalHints)
 * or stashed in RegionalHintHandoff. It contains codes, an IANA zone and
 * locale tags — NEVER GPS coordinates and NEVER an IP address.
 */
export interface RegionalHints {
  v: typeof REGIONAL_HINTS_VERSION;
  /** Browser IANA zone (Intl.DateTimeFormat().resolvedOptions().timeZone). */
  timezone?: string;
  /** navigator.languages, canonicalised, most preferred first. */
  locales?: string[];
  /**
   * Country the browser resolved locally from a GPS fix. The server only gets
   * the code, the accuracy radius and whether that radius crosses a border.
   */
  geo?: { country: string; accuracyM?: number; borderRisk: boolean };
  /** Country (code only) the server resolved from the request IP. */
  ipCountry?: string;
  capturedAt: string;
}

export type CountryValidator = (code: string) => Promise<boolean>;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Turns whatever the client sent into a safe RegionalHints document, or null
 * when nothing usable is left. Never throws and never rejects the request:
 * invalid pieces are dropped individually (registration must keep working for
 * old clients and for tampered/garbage input). The server-side `ipCountry` is
 * deliberately NOT read from the client — see `withIpCountry`.
 */
export async function sanitizeRegionalHints(
  raw: unknown,
  isKnownCountry: CountryValidator,
  now: Date = new Date(),
): Promise<RegionalHints | null> {
  if (!isPlainObject(raw)) return null;

  const hints: RegionalHints = {
    v: REGIONAL_HINTS_VERSION,
    capturedAt: now.toISOString(),
  };

  if (isValidIanaTimezone(raw.timezone)) {
    hints.timezone = raw.timezone;
  }

  if (Array.isArray(raw.locales)) {
    const seen = new Set<string>();
    for (const item of raw.locales.slice(0, 20)) {
      const canonical = canonicalizeLocale(item);
      if (canonical && !seen.has(canonical)) seen.add(canonical);
      if (seen.size >= REGIONAL_LIMITS.maxLocales) break;
    }
    if (seen.size > 0) hints.locales = [...seen];
  }

  if (isPlainObject(raw.geo)) {
    const country =
      typeof raw.geo.country === 'string' ? raw.geo.country.toUpperCase() : '';
    if (/^[A-Z]{2}$/.test(country) && (await isKnownCountry(country))) {
      const accuracy = raw.geo.accuracyM;
      hints.geo = {
        country,
        borderRisk: raw.geo.borderRisk === true,
        ...(typeof accuracy === 'number' &&
        Number.isFinite(accuracy) &&
        accuracy >= 0 &&
        accuracy <= REGIONAL_LIMITS.maxAccuracyMeters
          ? { accuracyM: Math.round(accuracy) }
          : {}),
      };
    }
  }

  return hints.timezone || hints.locales || hints.geo ? hints : null;
}

/** Adds the server-resolved IP country (a validated code) to the hints. */
export function withIpCountry(
  hints: RegionalHints | null,
  ipCountry: string | null,
  now: Date = new Date(),
): RegionalHints | null {
  if (!ipCountry || !/^[A-Z]{2}$/.test(ipCountry)) return hints;
  return {
    v: REGIONAL_HINTS_VERSION,
    capturedAt: hints?.capturedAt ?? now.toISOString(),
    ...(hints ?? {}),
    ipCountry,
  };
}

/**
 * Re-validates a document read back from the database / handoff table. The
 * JSON columns are untrusted until proven otherwise (manual edits, older
 * versions): anything not matching the current shape is dropped.
 */
export async function parseStoredHints(
  stored: unknown,
  isKnownCountry: CountryValidator,
): Promise<RegionalHints | null> {
  if (!isPlainObject(stored) || stored.v !== REGIONAL_HINTS_VERSION) {
    return null;
  }

  const base = await sanitizeRegionalHints(
    stored,
    isKnownCountry,
    typeof stored.capturedAt === 'string' &&
      !Number.isNaN(Date.parse(stored.capturedAt))
      ? new Date(stored.capturedAt)
      : new Date(),
  );

  const ip =
    typeof stored.ipCountry === 'string' &&
    /^[A-Z]{2}$/.test(stored.ipCountry) &&
    (await isKnownCountry(stored.ipCountry))
      ? stored.ipCountry
      : null;

  return withIpCountry(base, ip);
}
