import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ar, enUS } from "date-fns/locale";
import { format } from "date-fns";
import { FiCheck, FiClock, FiEdit2, FiTrash2, FiXCircle } from "react-icons/fi";

import type { CalendarEvent } from "../../types/calendar";
import { eventDateKeys } from "./calendarDates";
import { CALENDAR_STATUS_LABEL_KEY, calendarStatusBadgeClass, isCalendarEventPastDue } from "./calendarMeta";

interface CalendarAgendaProps {
  events: CalendarEvent[];
  memberNameById: Record<string, string>;
  contactNameById: Record<string, string>;
  leadNameById: Record<string, string>;
  dealNameById: Record<string, string>;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onSetStatus: (event: CalendarEvent, status: "completed" | "cancelled" | "scheduled") => void;
}

export default function CalendarAgenda({
  events,
  memberNameById,
  contactNameById,
  leadNameById,
  dealNameById,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
  onSetStatus,
}: CalendarAgendaProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;

  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    for (const event of events) {
      // An event's *first* day-key is enough for the agenda — unlike
      // the month grid, a multi-day event should appear once, not once
      // per day it spans.
      const [firstKey] = eventDateKeys(event);
      if (!firstKey) continue;
      const bucket = map.get(firstKey);
      if (bucket) {
        bucket.push(event);
      } else {
        map.set(firstKey, [event]);
      }
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dayEvents]) => ({
        key,
        date: new Date(`${key}T00:00:00`),
        events: dayEvents.sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
        ),
      }));
  }, [events]);

  const relatedEntityLabel = (event: CalendarEvent): string | null => {
    if (event.contactId && contactNameById[event.contactId]) {
      return `${t("calendarContact")}: ${contactNameById[event.contactId]}`;
    }
    if (event.leadId && leadNameById[event.leadId]) {
      return `${t("calendarLead")}: ${leadNameById[event.leadId]}`;
    }
    if (event.dealId && dealNameById[event.dealId]) {
      return `${t("calendarDeal")}: ${dealNameById[event.dealId]}`;
    }
    return null;
  };

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-16 text-center">
        <FiClock className="text-slate-300" size={28} />
        <p className="text-sm font-medium text-slate-500">{t("calendarEmptyState")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {format(group.date, "EEEE, MMMM d", { locale })}
          </h3>

          <div className="flex flex-col gap-2">
            {group.events.map((event) => {
              const pastDue = isCalendarEventPastDue(event);
              const related = relatedEntityLabel(event);

              return (
                <div
                  key={event.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          pastDue ? "bg-amber-100 text-amber-700" : calendarStatusBadgeClass(event.status)
                        }`}
                      >
                        {t(pastDue ? "calendarStatusPastDue" : CALENDAR_STATUS_LABEL_KEY[event.status])}
                      </span>
                      <span
                        className={`truncate text-sm font-semibold text-slate-800 ${
                          event.status === "cancelled" ? "line-through opacity-60" : ""
                        }`}
                      >
                        {event.title}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>
                        {event.allDay
                          ? t("calendarAllDay")
                          : `${format(new Date(event.startAt), "HH:mm")} \u2013 ${format(
                              new Date(event.endAt),
                              "HH:mm",
                            )}`}
                      </span>
                      {event.location && <span className="truncate">{event.location}</span>}
                      {event.assignedToId && (
                        <span>
                          {t("assignedTo")}: {memberNameById[event.assignedToId] ?? "\u2014"}
                        </span>
                      )}
                      {related && <span className="truncate">{related}</span>}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    {canUpdate && event.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => onSetStatus(event, "completed")}
                        aria-label={t("calendarMarkComplete")}
                        title={t("calendarMarkComplete")}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-600"
                      >
                        <FiCheck size={16} />
                      </button>
                    )}
                    {canUpdate && event.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => onSetStatus(event, "cancelled")}
                        aria-label={t("calendarCancelEvent")}
                        title={t("calendarCancelEvent")}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <FiXCircle size={16} />
                      </button>
                    )}
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => onEdit(event)}
                        aria-label={t("edit")}
                        title={t("edit")}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <FiEdit2 size={16} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(event)}
                        aria-label={t("delete")}
                        title={t("delete")}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}