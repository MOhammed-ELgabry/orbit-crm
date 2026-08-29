export const ACTIVITY_REPOSITORY = Symbol('ACTIVITY_REPOSITORY');

/**
 * Whitelist of valid Activity.type values.
 *
 * Enforced only at the application layer (DTO validation), not as a
 * database enum/CHECK constraint — the column remains a plain string in
 * schema.prisma. Same choice already made for Contact.status (see
 * CONTACT_STATUSES): the exact set of activity types a CRM timeline
 * needs is a product decision, not something this module should guess
 * and lock into the database schema. Adjust freely — doing so never
 * requires a migration.
 */
export const ACTIVITY_TYPES = [
  'NOTE',
  'CALL',
  'EMAIL',
  'MEETING',
  'TASK',
  'STATUS_CHANGE',
  'SYSTEM',
  'OTHER',
] as const;

/**
 * Fields a caller may sort the timeline by. Kept separate from
 * ACTIVITY_TYPES rather than merged into a generic constant, matching
 * how ContactQueryDto/ContactRepository each restate their own
 * sortable-field list inline rather than sharing one.
 */
export const ACTIVITY_SORTABLE_FIELDS = [
  'occurredAt',
  'createdAt',
  'updatedAt',
  'type',
] as const;
