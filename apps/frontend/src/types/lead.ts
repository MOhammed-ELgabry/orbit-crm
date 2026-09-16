export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

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
  status?: LeadStatus;
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