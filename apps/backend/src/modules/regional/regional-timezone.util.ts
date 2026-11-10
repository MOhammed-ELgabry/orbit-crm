/**
 * IANA timezone / BCP-47 locale validation. Pure (no DB) so it can be used by
 * DTO validators, the hint sanitizer and the settings service alike.
 *
 * A timezone is only ever accepted as an IANA identifier ("Africa/Cairo"),
 * never as an offset ("+02:00", "UTC+2", "GMT+3"): offsets silently break at
 * DST changes, which is exactly what the platform stores zones to avoid.
 */

const IANA_SHAPE = /^(?:UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2})$/;

/** `Etc/GMT+3`-style fixed-offset zones are offsets in disguise. */
const FIXED_OFFSET_ZONE = /^Etc\/GMT[+-]\d{1,2}$/i;

export function isValidIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length < 3 || value.length > 64) return false;
  if (!IANA_SHAPE.test(value) || FIXED_OFFSET_ZONE.test(value)) return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the canonical BCP-47 tag, or null when the value is not a
 * well-formed, structurally valid language tag.
 */
export function canonicalizeLocale(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length < 2 || value.length > 35) return null;

  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    return canonical ?? null;
  } catch {
    return null;
  }
}

/** ISO 3166-1 alpha-2 region subtag of a locale ("ar-EG" -> "EG"), if any. */
export function localeRegion(locale: string): string | null {
  try {
    return new Intl.Locale(locale).region ?? null;
  } catch {
    return null;
  }
}
