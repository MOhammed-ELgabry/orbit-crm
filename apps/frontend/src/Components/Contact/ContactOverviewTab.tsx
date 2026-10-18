import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";

import type { KeyedResource } from "../../hooks/useKeyedResource";
import type { ActivityListResult } from "../../services/activityService";
import type { CalendarEventListResult } from "../../services/calendarService";
import type { DealListResult } from "../../services/dealService";
import type { TaskListResult } from "../../services/taskService";
import {
  CONTACT_SECTION_LIMIT,
  NO_DATE,
  UPCOMING_EVENTS_WINDOW_DAYS,
  allDayDate,
  parseDate,
  summarizeOpenDeals,
  summarizeOpenTasks,
} from "../../lib/contact360";
import { formatDealAmount } from "../Deal/dealStage";

export type ContactTab =
  "overview" | "timeline" | "deals" | "tasks" | "calendar";

interface ContactOverviewTabProps {
  deals: KeyedResource<DealListResult>;
  tasks: KeyedResource<TaskListResult>;
  events: KeyedResource<CalendarEventListResult>;
  lastActivity: KeyedResource<ActivityListResult>;
  onOpenTab: (tab: ContactTab) => void;
}

interface SummaryCardProps {
  title: string;
  status: KeyedResource<unknown>["status"];
  onRetry: () => void;
  onOpen: () => void;
  children: ReactNode;
}

function SummaryCard({
  title,
  status,
  onRetry,
  onOpen,
  children,
}: SummaryCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-100 p-4">
      <p className="text-xs font-semibold text-slate-500">{title}</p>

      {(status === "loading" || status === "idle") && (
        <div
          className="mt-1 h-7 w-16 animate-pulse rounded bg-slate-100"
          aria-busy="true"
        />
      )}

      {status === "forbidden" && (
        <p className="text-xs text-slate-400">{t("contact360NoAccessTitle")}</p>
      )}

      {(status === "error" || status === "not-found") && (
        <div className="flex flex-col items-start gap-1">
          <p className="text-xs text-slate-500">{t("somethingWentWrong")}</p>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {status === "ready" && (
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-col items-start gap-1 text-start"
        >
          {children}
        </button>
      )}
    </div>
  );
}

/**
 * Customer summary. Every figure is computed from the records the section
 * tabs already loaded (no aggregate endpoint exists): a source the user may
 * not read is not requested and gets no card, and a figure that cannot be
 * exact (more records than one page) is marked "N+" rather than guessed.
 */
export default function ContactOverviewTab({
  deals,
  tasks,
  events,
  lastActivity,
  onOpenTab,
}: ContactOverviewTabProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;

  const dealsSummary = deals.data
    ? summarizeOpenDeals(deals.data.deals, deals.data.meta.hasNextPage)
    : null;
  const tasksSummary = tasks.data
    ? summarizeOpenTasks(tasks.data.tasks, tasks.data.meta.hasNextPage)
    : null;
  const eventsList = events.data?.events ?? [];
  const eventsHasMore = events.data?.meta.hasMore ?? false;
  const latest = lastActivity.data?.activities[0] ?? null;

  // Dates from the API go through parseDate/allDayDate first: date-fns
  // throws on an Invalid Date, which would take the whole page down.
  const nextEvent = eventsList[0] ?? null;
  const nextEventWhen = nextEvent
    ? nextEvent.allDay
      ? allDayDate(nextEvent.startAt)
      : parseDate(nextEvent.startAt)
    : null;
  const latestWhen = latest ? parseDate(latest.occurredAt) : null;

  const isPartial =
    (dealsSummary?.isPartial ?? false) || (tasksSummary?.isPartial ?? false);

  const visible = [deals, tasks, events, lastActivity].some(
    (resource) => resource.status !== "idle",
  );

  if (!visible) {
    // The user may read none of the related sources: say so instead of
    // leaving an empty panel.
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        {t("contact360NoAccessTitle")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {deals.status !== "idle" && (
          <SummaryCard
            title={t("contact360OpenDeals")}
            status={deals.status}
            onRetry={deals.retry}
            onOpen={() => onOpenTab("deals")}
          >
            <span className="text-2xl font-semibold text-slate-800">
              {dealsSummary?.count ?? 0}
              {dealsSummary?.isPartial ? "+" : ""}
            </span>
            {dealsSummary?.totalValue && (
              <span className="text-xs text-slate-500">
                {t("contact360OpenValue", {
                  amount: formatDealAmount(dealsSummary.totalValue),
                })}
              </span>
            )}
          </SummaryCard>
        )}

        {tasks.status !== "idle" && (
          <SummaryCard
            title={t("contact360OpenTasks")}
            status={tasks.status}
            onRetry={tasks.retry}
            onOpen={() => onOpenTab("tasks")}
          >
            <span className="text-2xl font-semibold text-slate-800">
              {tasksSummary?.count ?? 0}
              {tasksSummary?.isPartial ? "+" : ""}
            </span>
            {tasksSummary && tasksSummary.overdue > 0 && (
              <span className="text-xs text-red-600">
                {t("contact360OverdueTasks", { count: tasksSummary.overdue })}
              </span>
            )}
          </SummaryCard>
        )}

        {events.status !== "idle" && (
          <SummaryCard
            title={t("contact360UpcomingEvents")}
            status={events.status}
            onRetry={events.retry}
            onOpen={() => onOpenTab("calendar")}
          >
            <span className="text-2xl font-semibold text-slate-800">
              {eventsList.length}
              {eventsHasMore ? "+" : ""}
            </span>
            <span className="text-xs text-slate-500">
              {nextEvent
                ? t("contact360NextEvent", {
                    when: nextEventWhen
                      ? format(nextEventWhen, nextEvent.allDay ? "PP" : "PPp", {
                          locale,
                        })
                      : NO_DATE,
                  })
                : t("contact360UpcomingWindow", {
                    days: UPCOMING_EVENTS_WINDOW_DAYS,
                  })}
            </span>
          </SummaryCard>
        )}

        {lastActivity.status !== "idle" && (
          <SummaryCard
            title={t("contact360LastActivity")}
            status={lastActivity.status}
            onRetry={lastActivity.retry}
            onOpen={() => onOpenTab("timeline")}
          >
            {latest ? (
              <>
                <span className="line-clamp-2 text-sm font-semibold text-slate-800">
                  {latest.title}
                </span>
                <span className="text-xs text-slate-500">
                  {latestWhen
                    ? formatDistanceToNow(latestWhen, {
                        addSuffix: true,
                        locale,
                      })
                    : NO_DATE}
                </span>
              </>
            ) : (
              <span className="text-sm text-slate-500">
                {t("contact360NoActivityYet")}
              </span>
            )}
          </SummaryCard>
        )}
      </div>

      {isPartial && (
        <p className="text-center text-xs text-amber-600">
          {t("contact360PartialCount", { count: CONTACT_SECTION_LIMIT })}
        </p>
      )}
    </div>
  );
}
