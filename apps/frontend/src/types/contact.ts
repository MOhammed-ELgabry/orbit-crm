/**
 * Mirrors backend/src/modules/contact/entities/contact.entity.ts and its
 * DTOs exactly — field-for-field, including which fields are nullable
 * vs optional-on-write. Keep these two in sync by hand; there is no
 * shared-types package between the two apps in this repo.
 */

/**
 * Mirrors CONTACT_STATUSES (backend/src/modules/contact/constants/contact.constants.ts).
 * That list is explicitly a placeholder the backend says may change
 * without a migration — if it changes, update this list too.
 */
export const CONTACT_STATUSES = [
  "active",
  "inactive",
  "lead",
  "customer",
  "archived",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface Contact {
  id: string;
  companyId: string;

  firstName: string;
  lastName: string;

  email: string | null;
  phone: string | null;
  mobile: string | null;

  jobTitle: string | null;
  organizationName: string | null;
  website: string | null;

  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;

  notes: string | null;
  source: string | null;
  status: string;

  createdById: string;
  assignedToId: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** POST /contacts body. companyId/createdById are never client-supplied — the backend derives both from the authenticated session. */
export interface CreateContactInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  mobile?: string;
  jobTitle?: string;
  organizationName?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  notes?: string;
  source?: string;
  status?: string;
  assignedToId?: string;
}

/** PATCH /contacts/:id body — same shape, all optional. */
export type UpdateContactInput = Partial<CreateContactInput>;

export interface ContactQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?:
    | "firstName"
    | "lastName"
    | "email"
    | "organizationName"
    | "createdAt"
    | "updatedAt"
    | "status";
  sortOrder?: "asc" | "desc";
  status?: string;
  assignedToId?: string;
}
