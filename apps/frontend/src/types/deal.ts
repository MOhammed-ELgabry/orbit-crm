/**
 * Mirrors backend/src/modules/deal/entities/deal.entity.ts and its DTOs
 * exactly — field-for-field, including which fields are nullable vs
 * optional-on-write. Keep these two in sync by hand; there is no
 * shared-types package between the two apps in this repo.
 */

/**
 * Mirrors DEAL_STAGES (backend/src/modules/deal/constants/deal.constants.ts).
 * That list is explicitly a placeholder the backend says may change
 * without a migration — if it changes, update this list too. The last
 * two are terminal/closed stages, not a separate status field — see
 * that file's comment for why.
 */
export const DEAL_STAGES = [
  "new",
  "qualification",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const CLOSED_DEAL_STAGES: readonly DealStage[] = [
  "closed_won",
  "closed_lost",
];

export interface Deal {
  id: string;
  companyId: string;

  title: string;
  // A Prisma.Decimal column serializes to a JSON string, never a
  // number — see DealEntity's own comment on the backend for why (JS
  // numbers lose precision that a Decimal's string form doesn't).
  // Convert with Number(deal.amount) only for display formatting/math,
  // never store the converted value back as the source of truth.
  amount: string;

  stage: DealStage;
  notes: string | null;
  expectedCloseDate: string | null;

  contactId: string | null;
  leadId: string | null;

  createdById: string;
  assignedToId: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateDealInput {
  title: string;
  amount?: number;
  stage?: DealStage;
  notes?: string;
  expectedCloseDate?: string;
  contactId?: string;
  leadId?: string;
  assignedToId?: string;
}

export type UpdateDealInput = Partial<CreateDealInput>;

export interface DealQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  stage?: DealStage;
  assignedToId?: string;
  contactId?: string;
  leadId?: string;
}