import type { Task, TaskPriority, TaskStatus } from "../../types/task";
import { CLOSED_TASK_STATUSES } from "../../types/task";

export const TASK_STATUS_LABEL_KEY: Record<TaskStatus, string> = {
  todo: "taskStatusTodo",
  in_progress: "taskStatusInProgress",
  completed: "taskStatusCompleted",
  cancelled: "taskStatusCancelled",
};

export function taskStatusBadgeClass(status: TaskStatus): string {
  switch (status) {
    case "todo":
      return "bg-gray-100 text-gray-700";
    case "in_progress":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export const TASK_PRIORITY_LABEL_KEY: Record<TaskPriority, string> = {
  low: "taskPriorityLow",
  medium: "taskPriorityMedium",
  high: "taskPriorityHigh",
};

export function taskPriorityBadgeClass(priority: TaskPriority): string {
  switch (priority) {
    case "low":
      return "bg-gray-100 text-gray-600";
    case "medium":
      return "bg-amber-100 text-amber-700";
    case "high":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

/**
 * A task is overdue only while it's still open — a completed or
 * cancelled task with a due date in the past isn't something the user
 * needs flagged. Purely a display computation (no new endpoint/filter);
 * "today" is read fresh on every call rather than cached, so a task
 * that was fine at page-load correctly flips to overdue if the page is
 * left open across midnight.
 */
export function isTaskOverdue(task: Pick<Task, "dueDate" | "status">): boolean {
  if (!task.dueDate) return false;
  if (CLOSED_TASK_STATUSES.includes(task.status)) return false;

  return new Date(task.dueDate).getTime() < Date.now();
}