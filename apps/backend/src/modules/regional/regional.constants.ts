/**
 * Regional / international foundation — shared vocabularies.
 *
 * These mirror the CHECK constraints of migration
 * 20261109120000_international_regional_foundation.
 */

export const REGIONAL_STATUSES = [
  'DETECTED',
  'CONFIRMED',
  'NEEDS_REVIEW',
] as const;
export type RegionalStatus = (typeof REGIONAL_STATUSES)[number];

export const REGIONAL_SOURCES = [
  'GEOLOCATION',
  'IP',
  'TIMEZONE',
  'LOCALE',
] as const;
export type RegionalSource = (typeof REGIONAL_SOURCES)[number];

export const REGIONAL_CONFIDENCES = [
  'HIGH',
  'MEDIUM',
  'LOW',
  'AMBIGUOUS',
] as const;
export type RegionalConfidence = (typeof REGIONAL_CONFIDENCES)[number];

/** Version of the temporary hints document stored on User.regionalHints. */
export const REGIONAL_HINTS_VERSION = 1;

export const REGIONAL_LIMITS = {
  maxLocales: 5,
  maxLocaleLength: 35,
  maxTimezoneLength: 64,
  /** GPS accuracy radius above which the hint is meaningless (metres). */
  maxAccuracyMeters: 1_000_000,
} as const;

/** Handoff (social login) lifetime. Long enough for an OAuth round trip. */
export const REGIONAL_HANDOFF_TTL_MS = 15 * 60 * 1000;
export const REGIONAL_HANDOFF_COOKIE = 'orbit_rh';

/** Max age of reference-data cache in the process (ms). */
export const REGIONAL_REFERENCE_CACHE_MS = 5 * 60 * 1000;

/**
 * Signal weights of the suggestion engine. Documented and unit-tested; the
 * engine is deterministic so the same hints always give the same suggestion.
 *  - GEOLOCATION: physical position measured by the device (client resolves
 *    the country locally from coordinates, server never sees coordinates).
 *  - IP: country of the request IP from a local database (VPN/NAT can lie).
 *  - TIMEZONE: the device's IANA zone (unique zone => country; shared zone
 *    => every member country gets the lesser weight).
 *  - LOCALE: region subtag of navigator.languages (weakest; tie-breaker).
 */
export const SIGNAL_WEIGHTS = {
  GEOLOCATION: 3,
  IP: 2,
  TIMEZONE_UNIQUE: 2,
  TIMEZONE_SHARED: 1,
  LOCALE_FIRST: 1,
  LOCALE_OTHER: 0.5,
} as const;

/** Score thresholds: >= HIGH => HIGH, >= MEDIUM => MEDIUM, else LOW. */
export const CONFIDENCE_THRESHOLDS = { HIGH: 4, MEDIUM: 3 } as const;

/** Winner must lead the runner-up by at least this much, otherwise AMBIGUOUS. */
export const AMBIGUITY_MARGIN = 2;
