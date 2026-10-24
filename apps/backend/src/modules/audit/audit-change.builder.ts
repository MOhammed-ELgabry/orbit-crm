import { Prisma } from '@prisma/client';

import { AUDIT_ENTITY_CONFIG } from './audit.constants';
import {
  AUDIT_LIMITS,
  type AuditChanges,
  type AuditEntityType,
} from './audit.types';

type RecordLike = Record<string, unknown>;

/**
 * Turns a raw column value into something safe and comparable:
 * Date → ISO-8601 (UTC), Decimal/bigint → string, long strings truncated,
 * anything exotic (objects, arrays, functions) → dropped (undefined).
 */
export function normalizeAuditValue(value: unknown, truncate = true): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }

  switch (typeof value) {
    case 'string':
      return truncate && value.length > AUDIT_LIMITS.stringValue
        ? `${value.slice(0, AUDIT_LIMITS.stringValue)}…`
        : value;
    case 'number':
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    default:
      return undefined;
  }
}

const read = (record: object | null | undefined, field: string): unknown =>
  record ? normalizeAuditValue((record as RecordLike)[field]) : null;

/**
 * Same as read() but never truncates: used ONLY to decide whether a field
 * changed, so two long texts that differ after the truncation point are still
 * detected as a change. The truncated form is what gets recorded.
 */
const readForCompare = (
  record: object | null | undefined,
  field: string,
): unknown =>
  record ? normalizeAuditValue((record as RecordLike)[field], false) : null;

const emptyToNull = (changes: AuditChanges): AuditChanges | null =>
  Object.keys(changes).length > 0 ? changes : null;

/**
 * `create`: only the operational (valueFields) initial values that are set.
 * Personal fields are not listed at all on creation.
 */
export function buildCreateChanges(
  entityType: AuditEntityType,
  after: object,
): AuditChanges | null {
  const { valueFields } = AUDIT_ENTITY_CONFIG[entityType];
  const changes: AuditChanges = {};

  for (const field of valueFields) {
    const value = read(after, field);

    if (value !== null && value !== undefined) {
      changes[field] = { old: null, new: value };
    }
  }

  return emptyToNull(changes);
}

/**
 * `update`: the fields whose value actually changed.
 * - operational fields → { old, new }
 * - personal / free-text fields → { changed: true } (values never stored)
 * Returns null when nothing allowlisted changed (the caller then writes no
 * event: a no-op PATCH is not an auditable change).
 */
export function buildUpdateChanges(
  entityType: AuditEntityType,
  before: object,
  after: object,
): AuditChanges | null {
  const { valueFields, maskedFields } = AUDIT_ENTITY_CONFIG[entityType];
  const changes: AuditChanges = {};

  for (const field of valueFields) {
    if (readForCompare(before, field) !== readForCompare(after, field)) {
      changes[field] = {
        old: read(before, field),
        new: read(after, field),
      };
    }
  }

  for (const field of maskedFields) {
    if (readForCompare(before, field) !== readForCompare(after, field)) {
      changes[field] = { changed: true };
    }
  }

  return emptyToNull(changes);
}

/** Human label of a record (name/title) at event time, from the allowlist. */
export function buildEntityLabel(
  entityType: AuditEntityType,
  record: object,
): string | null {
  const label = AUDIT_ENTITY_CONFIG[entityType].label(record as RecordLike);

  if (!label) {
    return null;
  }

  return label.length > AUDIT_LIMITS.label
    ? `${label.slice(0, AUDIT_LIMITS.label - 1)}…`
    : label;
}

/**
 * Caps the serialized size of a JSON column. An oversized value is replaced
 * by a marker rather than truncated mid-structure or dropped silently.
 */
export function capJson<T extends object>(
  value: T | null,
  maxBytes: number,
): T | { _truncated: true } | null {
  if (value === null) {
    return null;
  }

  return Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes
    ? { _truncated: true }
    : value;
}
