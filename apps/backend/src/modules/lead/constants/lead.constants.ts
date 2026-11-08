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
  'converted',
] as const;

/**
 * The status a Lead gets when it is converted into a Contact. It is set ONLY
 * by the lead-conversion module (in the same statement that stamps
 * `convertedAt`), never by a client.
 */
export const LEAD_CONVERTED_STATUS = 'converted' as const;

/**
 * The statuses a client may write through POST/PATCH /leads. Deliberately
 * excludes `converted`: that status is a fact produced by the conversion
 * workflow (it comes with convertedAt / convertedContactId /
 * convertedByDealId), so letting a client set it by hand would create a
 * "converted" Lead with no Contact behind it. Filtering by it
 * (GET /leads?status=converted) is allowed and uses LEAD_STATUSES.
 */
export const LEAD_WRITABLE_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'unqualified',
  'lost',
] as const;
