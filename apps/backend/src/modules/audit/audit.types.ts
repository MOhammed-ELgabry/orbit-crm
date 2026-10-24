/**
 * Shared types of the audit module.
 *
 * The vocabularies below are the ONLY values the writer will persist and the
 * ONLY values the read API will accept as filters.
 */

export const AUDIT_ENTITY_TYPES = [
  'contact',
  'lead',
  'deal',
  'task',
  'calendarEvent',
  'activity',
  'user',
  'role',
  'company',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'status_change',
  'role_assign',
  'password_changed',
  'import',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Request metadata. Best-effort and NOT trusted for any security decision. */
export interface AuditRequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Who is acting. `actorUserId` always comes from the authenticated server-side
 * context (the verified JWT subject, or the user resolved from a one-time
 * token) — never from a request body or query.
 */
export interface AuditActor extends AuditRequestMeta {
  actorUserId: string;
  /** Groups the events of one bulk operation (e.g. one import request). */
  correlationId?: string | null;
  /** Small non-sensitive context merged into the row's `metadata`. */
  metadata?: Record<string, unknown> | null;
}

/**
 * `{ field: { old, new } }` for operational fields,
 * `{ field: { changed: true } }` for personal / free-text fields,
 * plus the special `permissions: { added, removed }` entry of a role update.
 */
export type AuditChanges = Record<string, unknown>;

export interface AuditEntryInput {
  companyId: string;
  actorUserId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  entityLabel: string | null;
  changes: AuditChanges | null;
  metadata: Record<string, unknown> | null;
  correlationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/** Hard limits applied by the writer (defence against oversized rows). */
export const AUDIT_LIMITS = {
  label: 120,
  userAgent: 200,
  ipAddress: 64,
  stringValue: 200,
  changesBytes: 16 * 1024,
  metadataBytes: 4 * 1024,
} as const;
