export const DEAL_REPOSITORY = Symbol('DEAL_REPOSITORY');

/**
 * Whitelist of valid Deal.stage values, in pipeline order — the last
 * two are terminal/closed stages rather than a separate status field
 * (see the Deal model comment in schema.prisma for why).
 *
 * Enforced only at the application layer (DTO validation), not as a
 * database enum/CHECK constraint — the column remains a plain string in
 * schema.prisma, matching LEAD_STATUSES/CONTACT_STATUSES/ACTIVITY_TYPES'
 * same deliberate choice: the exact pipeline a CRM needs is a product
 * decision, not something to lock into the database schema. Adjusting
 * this list never requires a migration.
 */
export const DEAL_STAGES = [
  'new',
  'qualification',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

/**
 * The 2 terminal stages — a deal in either of these is no longer
 * "open". Used by DealRepository/DealService wherever open-vs-closed
 * matters (e.g. a future pipeline/dashboard query), without hand-typing
 * the pair in more than one place.
 */
export const CLOSED_DEAL_STAGES = ['closed_won', 'closed_lost'] as const;

/**
 * Fields a caller may sort the deal list by. Kept separate from
 * DEAL_STAGES rather than merged into a generic constant, matching how
 * LeadQueryDto/LeadRepository each restate their own sortable-field
 * list inline rather than sharing one.
 */
export const DEAL_SORTABLE_FIELDS = [
  'title',
  'amount',
  'stage',
  'expectedCloseDate',
  'createdAt',
  'updatedAt',
] as const;
