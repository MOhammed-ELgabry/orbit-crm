import type {
  AuditChanges,
  AuditFieldChange,
  AuditLogQuery,
} from "../types/audit";

/** Must match AUDIT_QUERY_LIMITS.maxRangeDays / defaultRangeDays on the backend. */
export const AUDIT_MAX_RANGE_DAYS = 90;
export const AUDIT_DEFAULT_RANGE_DAYS = 30;
export const AUDIT_PAGE_SIZE = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD of the LOCAL calendar day (never via toISOString, which is UTC). */
export function toLocalDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Default filter period: the last 30 local days, today included. */
export function defaultAuditRange(now: Date = new Date()): {
  from: string;
  to: string;
} {
  return {
    from: toLocalDateInput(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (AUDIT_DEFAULT_RANGE_DAYS - 1),
      ),
    ),
    to: toLocalDateInput(now),
  };
}

function parseLocalDate(value: string, endOfDay: boolean): Date | null {
  if (!DATE_PATTERN.test(value)) return null;

  const [y, m, d] = value.split("-").map(Number);
  const date = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);

  // Reject impossible dates such as 2026-02-31 (the Date constructor rolls over).
  return date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
    ? date
    : null;
}

export type AuditRangeError = "incomplete" | "order" | "tooLong";

/**
 * Converts two LOCAL calendar days into the ISO-8601 instants the API expects
 * (start of the first day .. end of the last day, in the viewer's timezone) and
 * applies the same rules as the backend: from <= to and at most 90 days. The
 * check uses the real instants, so a daylight-saving change cannot let an
 * over-long period through to a 400.
 */
export function resolveAuditRange(
  from: string,
  to: string,
):
  | { ok: true; from: string; to: string }
  | { ok: false; error: AuditRangeError } {
  const start = parseLocalDate(from, false);
  const end = parseLocalDate(to, true);

  if (!start || !end) return { ok: false, error: "incomplete" };
  if (start.getTime() > end.getTime()) return { ok: false, error: "order" };
  if (end.getTime() - start.getTime() > AUDIT_MAX_RANGE_DAYS * DAY_MS) {
    return { ok: false, error: "tooLong" };
  }

  return { ok: true, from: start.toISOString(), to: end.toISOString() };
}

/** Locale + the browser's own timezone; empty string for an invalid date. */
export function formatAuditDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(language === "ar" ? "ar" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const capitalize = (value: string) =>
  value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;

/** "status_change" -> "StatusChange"; used to build i18n keys. */
const pascal = (value: string) => value.split("_").map(capitalize).join("");

export const auditActionKey = (action: string) =>
  `auditAction${pascal(action)}`;
export const auditEntityKey = (entityType: string) =>
  `auditEntity${capitalize(entityType)}`;
export const auditFieldKey = (field: string) =>
  `auditField${capitalize(field)}`;
export const auditMetaKey = (key: string) => `auditMeta${capitalize(key)}`;
export const auditMetaValueKey = (value: string) =>
  `auditMetaValue${pascal(value)}`;

export type ChangeKind = "values" | "masked" | "permissions" | "unknown";

export function classifyChange(change: AuditFieldChange): ChangeKind {
  if (change && typeof change === "object") {
    if ("added" in change && "removed" in change) return "permissions";
    if ("changed" in change) return "masked";
    if ("old" in change && "new" in change) return "values";
  }
  return "unknown";
}

/** Field names of a detail's `changes`, in stored order. */
export const changedFieldNames = (changes: AuditChanges | null): string[] =>
  changes ? Object.keys(changes) : [];

/** Builds the API query from the applied filter state. */
export function buildAuditQuery(
  filters: {
    from: string;
    to: string;
    actorUserId: string;
    action: string;
    entityType: string;
    q: string;
  },
  page: number,
): AuditLogQuery | null {
  const range = resolveAuditRange(filters.from, filters.to);
  if (!range.ok) return null;

  const q = filters.q.trim();

  return {
    page,
    limit: AUDIT_PAGE_SIZE,
    from: range.from,
    to: range.to,
    ...(filters.actorUserId && { actorUserId: filters.actorUserId }),
    ...(filters.action && {
      action: filters.action as AuditLogQuery["action"],
    }),
    ...(filters.entityType && {
      entityType: filters.entityType as AuditLogQuery["entityType"],
    }),
    ...(q && { q }),
  };
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Display string for ONE recorded value (already operational, never personal). */
export function formatAuditValue(
  value: unknown,
  language: string,
  labels: { yes: string; no: string; empty: string },
): string {
  if (value === null || value === undefined || value === "")
    return labels.empty;
  if (typeof value === "boolean") return value ? labels.yes : labels.no;
  if (typeof value === "number") return value.toLocaleString(language);
  if (typeof value === "string") {
    return ISO_INSTANT.test(value)
      ? formatAuditDate(value, language) || value
      : value;
  }
  // Objects / arrays are never part of an operational value; do not render them.
  return labels.empty;
}
