/**
 * Passive regional signals — available without any permission prompt.
 * Helper evidence only: the timezone and the language list say where a
 * browser is configured, not where the company legally is.
 */

export interface PassiveSignals {
  /** IANA zone, never an offset ("Africa/Cairo"). */
  timezone?: string;
  /** navigator.languages, most preferred first. */
  locales?: string[];
}

export function collectPassiveSignals(): PassiveSignals {
  const signals: PassiveSignals = {};

  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Some privacy modes report "UTC": still a valid zone name; the server
    // decides how much weight (none) it deserves.
    if (typeof zone === "string" && zone.length > 0) signals.timezone = zone;
  } catch {
    // Intl unavailable: no timezone signal.
  }

  try {
    const list =
      typeof navigator !== "undefined"
        ? navigator.languages && navigator.languages.length > 0
          ? [...navigator.languages]
          : navigator.language
            ? [navigator.language]
            : []
        : [];
    if (list.length > 0) signals.locales = list.slice(0, 5);
  } catch {
    // No language signal.
  }

  return signals;
}
