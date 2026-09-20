export const LEAD_REPOSITORY = Symbol('LEAD_REPOSITORY');

/**
 * Whitelist of valid Lead.status values.
 *
 * Enforced only at the application layer (DTO validation), not as a
 * database enum/CHECK constraint — the column remains a plain string in
 * schema.prisma, matching CONTACT_STATUSES' same deliberate choice: the
 * exact lifecycle a CRM needs is a product decision, not something to
 * lock into the database schema. Adjusting this list never requires a
 * migration.
 */
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'unqualified',
  'lost',
] as const;
