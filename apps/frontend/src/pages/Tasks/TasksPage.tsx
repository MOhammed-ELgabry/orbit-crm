import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FiPlus,
  FiSearch,
  FiTrash2,
  FiEdit2,
  FiCheckCircle,
  FiCircle,
} from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
} from "../../services/taskService";
import { listTeamMembers } from "../../services/userService";
import type {
  CreateTaskInput,
  Task,
  TaskStatus,
  UpdateTaskInput,
} from "../../types/task";
import { TASK_STATUSES, TASK_PRIORITIES } from "../../types/task";
import {
  TASK_STATUS_LABEL_KEY,
  TASK_PRIORITY_LABEL_KEY,
  taskStatusBadgeClass,
  taskPriorityBadgeClass,
  isTaskOverdue,
} from "../../Components/Task/taskMeta";
import TaskFormModal from "../../Components/Task/TaskFormModal";
import { confirmAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import { trackEvent } from "../../lib/posthog";

const PAGE_SIZE = 10;

export default function TasksPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const canCreate = hasPermission("task:create");
  const canUpdate = hasPermission("task:update");
  const canDelete = hasPermission("task:delete");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [modalMode, setModalMode] = useState<"create" | Task | null>(null);

  // Only for showing an assignee's name next to each task — any
  // authenticated tenant member can already list team members (see
  // UsersPage/DealsPage), so this needs no extra permission of its own.
  const [memberNameById, setMemberNameById] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    listTeamMembers({ page: 1, limit: 100 })
      .then((result) => {
        const map: Record<string, string> = {};
        for (const member of result.members) {
          map[member.id] = `${member.firstName} ${member.lastName}`.trim();
        }
        setMemberNameById(map);
      })
      .catch(() => {
        // Non-fatal — assignee names just fall back to "Unassigned".
      });
  }, []);

  const load = useCallback(
    async (targetPage: number) => {
      setStatus("loading");
      try {
        const result = await listTasks({
          page: targetPage,
          limit: PAGE_SIZE,
          search: search.trim() || undefined,
          status: (statusFilter || undefined) as Task["status"] | undefined,
          priority: (priorityFilter || undefined) as
            | Task["priority"]
            | undefined,
          // Soonest-due-first is far more useful for a task queue than
          // creation order (which is what Deal's own list defaults
          // to) — tasks with no due date sort last, which is exactly
          // what a plain ascending sort on a nullable column already
          // does on this database.
          sortBy: "dueDate",
          sortOrder: "asc",
        });
        setTasks(result.tasks);
        setPage(result.meta.page);
        setTotalPages(result.meta.totalPages);
        setTotal(result.meta.total);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    },
    [search, statusFilter, priorityFilter],
  );

  useEffect(() => {
    const timeout = setTimeout(() => load(1), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, priorityFilter]);

  const trackStatusOutcome = (previousStatus: string, updated: Task) => {
    if (updated.status === previousStatus) return;

    trackEvent("task_status_changed", {
      from: previousStatus,
      to: updated.status,
    });

    if (updated.status === "completed") {
      trackEvent("task_completed");
    }
  };

  const handleCreateOrUpdate = async (
    input: CreateTaskInput | UpdateTaskInput,
  ) => {
    if (modalMode && modalMode !== "create") {
      const previousStatus = modalMode.status;
      // Safe: TaskFormModal only ever builds an UpdateTaskInput-shaped
      // object while editing (see its submit handler) — the union is
      // just so one component/prop serves both modes.
      const updated = await updateTask(modalMode.id, input as UpdateTaskInput);
      trackEvent("task_updated", { status: updated.status });
      trackStatusOutcome(previousStatus, updated);
      setTasks((prev) => prev.map((tk) => (tk.id === updated.id ? updated : tk)));
    } else {
      const created = await createTask(input as CreateTaskInput);
      trackEvent("task_created", {
        status: created.status,
        priority: created.priority,
      });
      setTasks((prev) => [created, ...prev].slice(0, PAGE_SIZE));
      setTotal((prev) => prev + 1);
    }
  };

  // A fast "done/not done" shortcut, independent of the full edit
  // form — see the Tasks MVP product decisions for why this earns its
  // place. Unchecking always returns to "todo" (not whatever
  // in-progress/etc. state it held before), matching how every
  // mainstream todo app treats un-completing an item; changing to
  // "in_progress"/"cancelled" specifically is still done via Edit.
  const handleToggleComplete = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === "completed" ? "todo" : "completed";
    const previous = tasks;

    setTasks((prev) =>
      prev.map((tk) => (tk.id === task.id ? { ...tk, status: nextStatus } : tk)),
    );

    try {
      const updated = await updateTask(task.id, { status: nextStatus });
      trackEvent("task_updated", { status: updated.status });
      trackStatusOutcome(task.status, updated);
      setTasks((prev) => prev.map((tk) => (tk.id === updated.id ? updated : tk)));
    } catch (error) {
      setTasks(previous);
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    }
  };

  const handleDelete = async (task: Task) => {
    const confirmed = await confirmAlert({
      title: t("confirmDeleteTitle"),
      text: t("deleteTaskConfirm"),
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    });
    if (!confirmed) return;

    const previous = tasks;
    setTasks((prev) => prev.filter((tk) => tk.id !== task.id));

    try {
      await deleteTask(task.id);
      trackEvent("task_deleted");
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (error) {
      setTasks(previous);
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    }
  };

  const dueDateClass = (task: Task) =>
    isTaskOverdue(task) ? "text-red-500 font-medium" : "text-slate-500";

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <FiSearch
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchTasksPlaceholder")}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none"
          >
            <option value="">{t("allStatuses")}</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(TASK_STATUS_LABEL_KEY[s])}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none"
          >
            <option value="">{t("allPriorities")}</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(TASK_PRIORITY_LABEL_KEY[p])}
              </option>
            ))}
          </select>

          {canCreate && (
            <button
              type="button"
              onClick={() => setModalMode("create")}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#605BFF] px-4 text-sm font-semibold text-white hover:bg-[#514cf0]"
            >
              <FiPlus size={16} />
              <span className="hidden sm:inline">{t("addTask")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-slate-100 bg-white">
        {status === "loading" && (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-50" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="text-sm text-slate-500">{t("somethingWentWrong")}</p>
            <button
              type="button"
              onClick={() => load(page)}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {status === "ready" && tasks.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-14 text-center">
            <p className="text-sm font-medium text-slate-600">
              {t("noTasksFoundTitle")}
            </p>
            <p className="text-xs text-slate-400">
              {t("noTasksFoundDescription")}
            </p>
          </div>
        )}

        {status === "ready" && tasks.length > 0 && (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-left sm:table">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="w-10 px-5 py-3" />
                  <th className="px-5 py-3 font-medium">{t("task")}</th>
                  <th className="px-5 py-3 font-medium">{t("taskPriority")}</th>
                  <th className="px-5 py-3 font-medium">{t("taskDueDate")}</th>
                  <th className="px-5 py-3 font-medium">{t("assignedTo")}</th>
                  <th className="px-5 py-3 font-medium">{t("taskStatus")}</th>
                  <th className="px-5 py-3 font-medium text-right">
                    {t("actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((tsk) => (
                  <tr
                    key={tsk.id}
                    className="border-b border-slate-50 text-sm last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        disabled={!canUpdate}
                        onClick={() => handleToggleComplete(tsk)}
                        aria-label={t(
                          tsk.status === "completed"
                            ? "taskMarkIncomplete"
                            : "taskMarkComplete",
                        )}
                        className="text-slate-300 hover:text-green-500 disabled:cursor-not-allowed disabled:hover:text-slate-300"
                      >
                        {tsk.status === "completed" ? (
                          <FiCheckCircle size={18} className="text-green-500" />
                        ) : (
                          <FiCircle size={18} />
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-700">
                      <span
                        className={
                          tsk.status === "completed"
                            ? "text-slate-400 line-through"
                            : ""
                        }
                      >
                        {tsk.title}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${taskPriorityBadgeClass(tsk.priority)}`}
                      >
                        {t(TASK_PRIORITY_LABEL_KEY[tsk.priority])}
                      </span>
                    </td>
                    <td className={`px-5 py-3 ${dueDateClass(tsk)}`}>
                      {tsk.dueDate ? tsk.dueDate.slice(0, 10) : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {tsk.assignedToId
                        ? (memberNameById[tsk.assignedToId] ?? "—")
                        : t("unassigned")}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${taskStatusBadgeClass(tsk.status)}`}
                      >
                        {t(TASK_STATUS_LABEL_KEY[tsk.status])}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => setModalMode(tsk)}
                            aria-label={t("edit")}
                            className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <FiEdit2 size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(tsk)}
                            aria-label={t("delete")}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <FiTrash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards — same actions as the desktop table
                (quick-complete, edit, delete), not just a stripped-down
                read-only view. */}
            <div className="divide-y divide-slate-50 sm:hidden">
              {tasks.map((tsk) => (
                <div key={tsk.id} className="flex items-start gap-3 px-4 py-3">
                  <button
                    type="button"
                    disabled={!canUpdate}
                    onClick={() => handleToggleComplete(tsk)}
                    aria-label={t(
                      tsk.status === "completed"
                        ? "taskMarkIncomplete"
                        : "taskMarkComplete",
                    )}
                    className="mt-0.5 shrink-0 text-slate-300 disabled:cursor-not-allowed"
                  >
                    {tsk.status === "completed" ? (
                      <FiCheckCircle size={18} className="text-green-500" />
                    ) : (
                      <FiCircle size={18} />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-medium ${
                        tsk.status === "completed"
                          ? "text-slate-400 line-through"
                          : "text-slate-700"
                      }`}
                    >
                      {tsk.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${taskStatusBadgeClass(tsk.status)}`}
                      >
                        {t(TASK_STATUS_LABEL_KEY[tsk.status])}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${taskPriorityBadgeClass(tsk.priority)}`}
                      >
                        {t(TASK_PRIORITY_LABEL_KEY[tsk.priority])}
                      </span>
                      {tsk.dueDate && (
                        <span className={`text-[11px] ${dueDateClass(tsk)}`}>
                          {tsk.dueDate.slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => setModalMode(tsk)}
                        aria-label={t("edit")}
                        className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                      >
                        <FiEdit2 size={15} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(tsk)}
                        aria-label={t("delete")}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <FiTrash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>
                  {total} {t("tasksNavLabel").toLowerCase()}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => load(page - 1)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40"
                  >
                    &larr;
                  </button>
                  <span>
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => load(page + 1)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40"
                  >
                    &rarr;
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modalMode && (
        <TaskFormModal
          task={modalMode === "create" ? undefined : modalMode}
          onClose={() => setModalMode(null)}
          onSubmit={handleCreateOrUpdate}
        />
      )}
    </div>
  );
}