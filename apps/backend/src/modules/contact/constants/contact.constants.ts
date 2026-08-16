export const CONTACT_REPOSITORY = Symbol('CONTACT_REPOSITORY');

/**
 * Whitelist of valid Contact.status values.
 *
 * This is enforced only at the application layer (DTO validation), not as a
 * database enum/CHECK constraint — the column remains a plain string in
 * schema.prisma. This is a deliberate choice: the exact set of lifecycle
 * statuses a CRM needs is a product decision, not something this hardening
 * pass should guess and lock into the database schema. The list below is a
 * reasonable placeholder covering common CRM contact states, matching the
 * existing 'active' default; adjust it freely — doing so never requires a
 * migration.
 */
export const CONTACT_STATUSES = [
  'active',
  'inactive',
  'lead',
  'customer',
  'archived',
] as const;
