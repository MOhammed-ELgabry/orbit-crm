export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');

/**
 * Whitelist of valid Task.status values.
 *
 * Enforced only at the application layer (DTO validation), not as a
 * database enum/CHECK constraint — the column remains a plain string in
 * schema.prisma, matching LEAD_STATUSES/DEAL_STAGES/CONTACT_STATUSES'
 * same deliberate choice: the exact lifecycle a CRM needs is a product
 * decision, not something to lock into the database schema. Adjusting
 * this list never requires a migration.
 *
 * 'completed' and 'cancelled' are terminal statuses. There is no
 * separate boolean "done" flag — see the Task model comment in
 * schema.prisma for why status alone carries this.
 */
export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'completed',
  'cancelled',
] as const;

/** The 2 terminal statuses — mirrors CLOSED_DEAL_STAGES. */
export const CLOSED_TASK_STATUSES = ['completed', 'cancelled'] as const;

/**
 * Whitelist of valid Task.priority values. Same application-layer-only
 * enforcement as TASK_STATUSES above.
 */
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

/**
 * Fields a caller may sort the task list by. Kept separate from
 * TASK_STATUSES/TASK_PRIORITIES rather than merged into a generic
 * constant, matching how DealQueryDto/DealRepository each restate their
 * own sortable-field list inline rather than sharing one.
 */
export const TASK_SORTABLE_FIELDS = [
  'title',
  'status',
  'priority',
  'dueDate',
  'createdAt',
  'updatedAt',
] as const;
