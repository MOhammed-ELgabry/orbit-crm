/**
 * Mirrors backend/src/modules/activity/entities/activity.entity.ts and
 * its DTOs exactly. See types/contact.ts for the same note on why this
 * is hand-kept-in-sync rather than shared/generated.
 */

/** Mirrors ACTIVITY_TYPES (backend/src/modules/activity/constants/activity.constants.ts). */
export const ACTIVITY_TYPES = [
  "NOTE",
  "CALL",
  "EMAIL",
  "MEETING",
  "TASK",
  "STATUS_CHANGE",
  "SYSTEM",
  "OTHER",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface Activity {
  id: string;
  companyId: string;

  type: string;

  title: string;
  description: string | null;

  occurredAt: string;

  createdById: string;
  contactId: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** POST /activities body. companyId/createdById are always derived server-side from the authenticated session, never client-supplied. */
export interface CreateActivityInput {
  type: string;
  title: string;
  description?: string;
  /** ISO 8601. Defaults to "now" server-side if omitted. */
  occurredAt?: string;
  contactId?: string;
}

/** PATCH /activities/:id body — same shape, all optional. */
export type UpdateActivityInput = Partial<CreateActivityInput>;

export interface ActivityQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: "occurredAt" | "createdAt" | "updatedAt" | "type";
  sortOrder?: "asc" | "desc";
  type?: string;
  contactId?: string;
  /** ISO 8601, inclusive lower bound on occurredAt. */
  dateFrom?: string;
  /** ISO 8601, inclusive upper bound on occurredAt. */
  dateTo?: string;
}
