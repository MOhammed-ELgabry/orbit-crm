import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";

import type { KeyedResource } from "../../hooks/useKeyedResource";
import type { TaskListResult } from "../../services/taskService";
import { CONTACT_SECTION_LIMIT, parseDate } from "../../lib/contact360";
import {
  TASK_PRIORITY_LABEL_KEY,
  TASK_STATUS_LABEL_KEY,
  isTaskOverdue,
  taskPriorityBadgeClass,
  taskStatusBadgeClass,
} from "../Task/taskMeta";

import ContactSectionState from "./ContactSectionState";

export default function ContactTasksTab({
  resource,
}: {
  resource: KeyedResource<TaskListResult>;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;
  const tasks = resource.data?.tasks ?? [];
  const hasMore = resource.data?.meta.hasNextPage ?? false;

  return (
    <ContactSectionState
      status={resource.status}
      onRetry={resource.retry}
      isEmpty={tasks.length === 0}
      emptyMessage={t("contact360NoTasks")}
    >
      <ul className="divide-y divide-slate-100">
        {tasks.map((task) => {
          const overdue = isTaskOverdue(task);
          // An unparsable date is shown as "no due date" instead of
          // crashing the page.
          const dueDate = parseDate(task.dueDate);

          return (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div className="min-w-0">
                {/* There is no task detail route; the Tasks page is the
                    destination (see the "Open Tasks" link below). */}
                <p className="truncate text-sm font-semibold text-slate-800">
                  {task.title}
                </p>
                <p
                  className={`text-xs ${overdue ? "text-red-600" : "text-slate-400"}`}
                >
                  {dueDate
                    ? `${t("taskDueDate")}: ${format(dueDate, "PP", { locale })}`
                    : t("contact360NoDueDate")}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${taskPriorityBadgeClass(task.priority)}`}
                >
                  {t(TASK_PRIORITY_LABEL_KEY[task.priority] ?? task.priority)}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${taskStatusBadgeClass(task.status)}`}
                >
                  {t(TASK_STATUS_LABEL_KEY[task.status] ?? task.status)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-center text-xs text-slate-400">
        {hasMore && (
          <span className="text-amber-600">
            {t("contact360PartialCount", { count: CONTACT_SECTION_LIMIT })}{" "}
          </span>
        )}
        <Link
          to="/dashboard/tasks"
          className="font-semibold text-brand-600 hover:underline"
        >
          {t("contact360OpenPage", { section: t("tasksNavLabel") })}
        </Link>
      </p>
    </ContactSectionState>
  );
}
