import { collectPassiveSignals } from "./signals";
import type { GeoHint } from "./geolocation";

/** Wire shape accepted by the backend (validated field by field there). */
export interface RegionalHintsPayload {
  timezone?: string;
  locales?: string[];
  geo?: GeoHint;
}

/** Passive signals plus an optional, user-consented GPS-derived country. */
export function buildRegionalHints(geo?: GeoHint | null): RegionalHintsPayload {
  const hints: RegionalHintsPayload = { ...collectPassiveSignals() };
  if (geo) hints.geo = geo;
  return hints;
}

export function hasAnyHint(hints: RegionalHintsPayload): boolean {
  return Boolean(hints.timezone || hints.locales?.length || hints.geo);
}
