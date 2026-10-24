import type {
  AuditLogDetail,
  AuditLogListItem,
  AuditLogListResult,
} from "../types/audit";

export const makeAuditItem = (
  overrides: Partial<AuditLogListItem> = {},
): AuditLogListItem => ({
  id: "audit-1",
  occurredAt: "2026-10-21T10:30:00.000Z",
  action: "update",
  entityType: "contact",
  entityId: "contact-1",
  entityLabel: "Amina Hassan",
  actor: { id: "user-1", name: "Omar Ali", status: "active" },
  changedFields: ["status", "email"],
  metadata: null,
  correlationId: null,
  ...overrides,
});

export const makeAuditDetail = (
  overrides: Partial<AuditLogDetail> = {},
): AuditLogDetail => ({
  ...makeAuditItem(),
  changes: {
    status: { old: "new", new: "won" },
    email: { changed: true },
  },
  ipAddress: "203.0.113.7",
  userAgent: "Mozilla/5.0 test",
  ...overrides,
});

export const auditList = (
  items: AuditLogListItem[],
  meta: Partial<AuditLogListResult["meta"]> = {},
): AuditLogListResult => ({
  items,
  meta: {
    page: 1,
    limit: 20,
    total: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    hasNextPage: false,
    hasPreviousPage: false,
    ...meta,
  },
});
