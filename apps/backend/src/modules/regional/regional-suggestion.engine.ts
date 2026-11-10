import {
  AMBIGUITY_MARGIN,
  CONFIDENCE_THRESHOLDS,
  SIGNAL_WEIGHTS,
  type RegionalConfidence,
  type RegionalSource,
  type RegionalStatus,
} from './regional.constants';
import type { RegionalHints } from './regional-hints';
import { localeRegion } from './regional-timezone.util';
import { TIMEZONE_COUNTRIES } from './data/timezone-countries.data';

export interface SuggestionReference {
  /** Default zone/locale of a country (suggestion fallback only). */
  getCountryDefaults(code: string): {
    defaultTimezone: string | null;
    defaultLocale: string | null;
  } | null;
}

export interface RegionalSuggestion {
  countryCode: string | null;
  timezone: string | null;
  locale: string | null;
  source: RegionalSource | null;
  confidence: RegionalConfidence;
  /** true when at least one signal disagreed with the chosen country. */
  conflict: boolean;
  /** Never CONFIRMED here: only the Owner confirms. */
  status: Exclude<RegionalStatus, 'CONFIRMED'>;
  score: number;
}

const SOURCE_PRIORITY: RegionalSource[] = [
  'GEOLOCATION',
  'IP',
  'TIMEZONE',
  'LOCALE',
];

interface Vote {
  source: RegionalSource;
  /** countries this signal supports, each with the weight it contributes */
  supports: Map<string, number>;
  /** a "strong" signal can contradict (locale never counts as conflict) */
  strong: boolean;
}

const DOWNGRADE: Record<'HIGH' | 'MEDIUM' | 'LOW', RegionalConfidence> = {
  HIGH: 'MEDIUM',
  MEDIUM: 'LOW',
  LOW: 'LOW',
};

/**
 * Deterministic country suggestion from the available signals.
 *
 * Principles (see the regional documentation):
 *  - Never confirms anything. The result is a SUGGESTION; the company country
 *    is only ever set by the Owner.
 *  - A GPS fix whose accuracy circle crosses a border contributes nothing.
 *  - Contradicting signals lower the confidence and force NEEDS_REVIEW.
 *  - When the best candidate does not clearly beat the runner-up, the result
 *    is AMBIGUOUS with NO country (the Owner is asked) instead of a coin flip.
 */
export function suggestRegionalSettings(
  hints: RegionalHints | null,
  reference: SuggestionReference,
): RegionalSuggestion {
  const empty: RegionalSuggestion = {
    countryCode: null,
    timezone: null,
    locale: null,
    source: null,
    confidence: 'AMBIGUOUS',
    conflict: false,
    status: 'NEEDS_REVIEW',
    score: 0,
  };

  if (!hints) return empty;

  const votes: Vote[] = [];

  if (hints.geo && !hints.geo.borderRisk) {
    votes.push({
      source: 'GEOLOCATION',
      strong: true,
      supports: new Map([[hints.geo.country, SIGNAL_WEIGHTS.GEOLOCATION]]),
    });
  }

  if (hints.ipCountry) {
    votes.push({
      source: 'IP',
      strong: true,
      supports: new Map([[hints.ipCountry, SIGNAL_WEIGHTS.IP]]),
    });
  }

  if (hints.timezone) {
    const countries = TIMEZONE_COUNTRIES[hints.timezone];
    if (countries && countries.length > 0) {
      const weight =
        countries.length === 1
          ? SIGNAL_WEIGHTS.TIMEZONE_UNIQUE
          : SIGNAL_WEIGHTS.TIMEZONE_SHARED;
      votes.push({
        source: 'TIMEZONE',
        strong: true,
        supports: new Map(countries.map((c) => [c, weight])),
      });
    }
  }

  if (hints.locales?.length) {
    const supports = new Map<string, number>();
    hints.locales.forEach((locale, index) => {
      const region = localeRegion(locale);
      if (region && !supports.has(region)) {
        supports.set(
          region,
          index === 0
            ? SIGNAL_WEIGHTS.LOCALE_FIRST
            : SIGNAL_WEIGHTS.LOCALE_OTHER,
        );
      }
    });
    if (supports.size > 0) {
      votes.push({ source: 'LOCALE', strong: false, supports });
    }
  }

  // Accumulate per-country score.
  const scores = new Map<string, number>();
  for (const vote of votes) {
    for (const [country, weight] of vote.supports) {
      // Only real, active countries can ever be suggested (e.g. a locale
      // region like "419" or an unknown code is ignored).
      if (!reference.getCountryDefaults(country)) continue;
      scores.set(country, (scores.get(country) ?? 0) + weight);
    }
  }

  const ranked = [...scores.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  if (ranked.length === 0) {
    // Nothing usable (e.g. only a border-crossing GPS fix): keep the user's
    // own zone as a harmless hint but suggest no country.
    return { ...empty, timezone: hints.timezone ?? null };
  }

  const [topCountry, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;

  const supporters = votes.filter((v) => v.supports.has(topCountry));
  const contradictors = votes.filter(
    (v) => v.strong && !v.supports.has(topCountry),
  );
  const conflict = contradictors.length > 0;

  const defaults = (code: string) => reference.getCountryDefaults(code);

  if (topScore - secondScore < AMBIGUITY_MARGIN && ranked.length > 1) {
    return {
      ...empty,
      timezone: hints.timezone ?? null,
      conflict: true,
      score: topScore,
    };
  }

  let confidence: RegionalConfidence =
    topScore >= CONFIDENCE_THRESHOLDS.HIGH
      ? 'HIGH'
      : topScore >= CONFIDENCE_THRESHOLDS.MEDIUM
        ? 'MEDIUM'
        : 'LOW';

  if (conflict) {
    confidence = DOWNGRADE[confidence];
  }

  const source =
    SOURCE_PRIORITY.find((s) => supporters.some((v) => v.source === s)) ?? null;

  // Zone: the user's own zone when it is consistent with the country,
  // otherwise the country's default zone.
  const countryZones = new Set(
    Object.entries(TIMEZONE_COUNTRIES)
      .filter(([, list]) => list.includes(topCountry))
      .map(([zone]) => zone),
  );
  const country = defaults(topCountry);
  const timezone =
    hints.timezone && countryZones.has(hints.timezone)
      ? hints.timezone
      : (country?.defaultTimezone ?? null);

  // Locale: first user locale whose region matches the country, else the
  // country's default locale.
  const matchingLocale = hints.locales?.find(
    (l) => localeRegion(l) === topCountry,
  );
  const locale = matchingLocale ?? country?.defaultLocale ?? null;

  const status: RegionalSuggestion['status'] =
    conflict || confidence === 'LOW' ? 'NEEDS_REVIEW' : 'DETECTED';

  return {
    countryCode: topCountry,
    timezone,
    locale,
    source,
    confidence,
    conflict,
    status,
    score: topScore,
  };
}
