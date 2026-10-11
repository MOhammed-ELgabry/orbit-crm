import type { ReportPeriod } from "../types/report";

/** Must match MAX_REPORT_RANGE_DAYS on the backend. */
export const MAX_REPORT_RANGE_DAYS = 366;

export const REPORT_PRESETS = [
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
] as const;

export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const DEFAULT_REPORT_PRESET: ReportPreset = "last30";

/** The viewer's IANA zone, as the browser reports it. */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD of the LOCAL calendar day of `date` (never via toISOString, which is UTC). */
export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Inclusive [from, to] local-calendar-day range for a preset, relative to
 * `now`. Built with the Date(year, month, day) constructor so month and DST
 * arithmetic stay on calendar days, not 24-hour multiples.
 */
export function presetRange(
  preset: ReportPreset,
  now: Date = new Date(),
): { from: string; to: string } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  switch (preset) {
    case "last7":
      return {
        from: formatLocalDate(new Date(year, month, day - 6)),
        to: formatLocalDate(now),
      };
    case "last30":
      return {
        from: formatLocalDate(new Date(year, month, day - 29)),
        to: formatLocalDate(now),
      };
    case "thisMonth":
      return {
        from: formatLocalDate(new Date(year, month, 1)),
        to: formatLocalDate(now),
      };
    case "lastMonth":
      return {
        from: formatLocalDate(new Date(year, month - 1, 1)),
        to: formatLocalDate(new Date(year, month, 0)),
      };
  }
}

export type RangeError = "incomplete" | "order" | "tooLong";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(value: string): number | null {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return date.getTime() / 86_400_000;
}

/** Same rules the backend enforces, so the user gets the message before a round trip. */
export function validateRange(from: string, to: string): RangeError | null {
  const fromDay = dayNumber(from);
  const toDay = dayNumber(to);

  if (fromDay === null || toDay === null) {
    return "incomplete";
  }

  if (fromDay > toDay) {
    return "order";
  }

  if (toDay - fromDay + 1 > MAX_REPORT_RANGE_DAYS) {
    return "tooLong";
  }

  return null;
}

export function buildPeriod(
  range: { from: string; to: string },
  timezone: string = getBrowserTimezone(),
): ReportPeriod {
  return { from: range.from, to: range.to, timezone };
}
