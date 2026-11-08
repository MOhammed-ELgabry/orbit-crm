export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "lost",
] as const;

/** Statuses a user may set (create/edit forms). */
export type WritableLeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * `converted` is set ONLY by the lead-conversion workflow (a client can never
 * write it), so it is not part of LEAD_STATUSES: the form never offers it.
 */
export const LEAD_STATUS_CONVERTED = "converted" as const;

/** The list filter, however, can show converted leads. */
export const LEAD_FILTER_STATUSES = [
  ...LEAD_STATUSES,
  LEAD_STATUS_CONVERTED,
] as const;

export type LeadStatus = WritableLeadStatus | typeof LEAD_STATUS_CONVERTED;

export interface Lead {
  id: string;
  companyId: string;

  firstName: string;
  lastName: string;

  email: string | null;
  phone: string | null;

  organizationName: string | null;

  source: string | null;
  status: LeadStatus;
  notes: string | null;

  /** Set only by the lead-conversion workflow. */
  convertedAt: string | null;
  convertedContactId: string | null;
  convertedByDealId: string | null;

  createdById: string;
  assignedToId: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateLeadInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  organizationName?: string;
  source?: string;
  status?: WritableLeadStatus;
  notes?: string;
  assignedToId?: string;
}

export type UpdateLeadInput = Partial<CreateLeadInput>;

export interface LeadQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: LeadStatus;
  assignedToId?: string;
}
