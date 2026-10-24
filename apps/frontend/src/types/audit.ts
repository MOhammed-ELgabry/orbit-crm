import type { PaginationMeta } from "./api";

/** Must mirror AUDIT_ENTITY_TYPES / AUDIT_ACTIONS of the backend audit module. */
export const AUDIT_ENTITY_TYPES = [
  "contact",
  "lead",
  "deal",
  "task",
  "calendarEvent",
  "activity",
  "user",
  "role",
  "company",
] as const;

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "status_change",
  "role_assign",
  "password_changed",
  "import",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditActorStatus = "active" | "inactive" | "deleted" | "unknown";

export interface AuditActor {
  id: string;
  name: string | null;
  status: AuditActorStatus;
}

/**
 * One entry of `changes`:
 *  - { old, new }          operational field, both values recorded
 *  - { changed: true }     personal / free-text field, value deliberately NOT recorded
 *  - { added, removed }    a role's permission diff ("resource:action" strings)
 */
export type AuditFieldChange =
  | { old: unknown; new: unknown }
  | { changed: true }
  | { added: string[]; removed: string[] };

export type AuditChanges = Record<string, AuditFieldChange>;

export interface AuditLogListItem {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  actor: AuditActor | null;
  changedFields: string[];
  metadata: Record<string, unknown> | null;
  correlationId: string | null;
}

export interface AuditLogDetail extends AuditLogListItem {
  changes: AuditChanges | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Query of GET /audit-logs. There is deliberately NO company / tenant field:
 * the backend derives the company from the verified session and rejects any
 * extra key.
 */
export interface AuditLogQuery {
  page: number;
  limit: number;
  from?: string;
  to?: string;
  actorUserId?: string;
  action?: AuditAction;
  entityType?: AuditEntityType;
  q?: string;
}

export interface AuditLogListResult {
  items: AuditLogListItem[];
  meta: PaginationMeta;
}
