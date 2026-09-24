
/**
 * Mirrors backend/src/modules/task/entities/task.entity.ts and its DTOs
 * exactly — field-for-field, including which fields are nullable vs
 * optional-on-write. Keep these two in sync by hand; there is no
 * shared-types package between the two apps in this repo (see
 * types/deal.ts for the same note).
 */

/**
 * Mirrors TASK_STATUSES (backend/src/modules/task/constants/task.constants.ts).
 * 'completed' and 'cancelled' are terminal — there is no separate
 * boolean "done" flag, see that file's comment for why.
 */
export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = [
  "completed",
  "cancelled",
];

/** Mirrors TASK_PRIORITIES. */
export const TASK_PRIORITIES = ["low", "medium", "high"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  id: string;
  companyId: string;

  title: string;
  description: string | null;

  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;

  // Derived by the backend from `status` — never send this on
  // create/update, see CreateTaskInput/UpdateTaskInput below.
  completedAt: string | null;

  contactId: string | null;
  leadId: string | null;
  dealId: string | null;

  createdById: string;
  assignedToId: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  contactId?: string;
  leadId?: string;
  dealId?: string;
  assignedToId?: string;
}

/**
 * Unlike CreateTaskInput, the 4 relationship-ish fields here accept
 * `null` explicitly — a cleared dropdown must be sent as `null`, not
 * omitted, or the backend has no way to distinguish "clear this" from
 * "leave it alone" (both the backend UpdateTaskDto and
 * TaskRepository.update rely on `undefined` meaning the latter). See
 * TaskFormModal's submit handler for where this is applied.
 */
export type UpdateTaskInput = Partial<
  Omit<
    CreateTaskInput,
    "dueDate" | "contactId" | "leadId" | "dealId" | "assignedToId"
  >
> & {
  dueDate?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
  assignedToId?: string | null;
};

export interface TaskQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedToId?: string;
  contactId?: string;
  leadId?: string;
  dealId?: string;
}

