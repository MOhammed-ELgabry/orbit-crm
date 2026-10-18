import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";

import type { KeyedResource } from "../../hooks/useKeyedResource";
import type { CalendarEventListResult } from "../../services/calendarService";
import {
  NO_DATE,
  UPCOMING_EVENTS_WINDOW_DAYS,
  allDayDate,
  parseDate,
} from "../../lib/contact360";
import {
  CALENDAR_STATUS_LABEL_KEY,
  calendarStatusBadgeClass,
} from "../Calendar/calendarMeta";

import ContactSectionState from "./ContactSectionState";

export default function ContactCalendarTab({
  resource,
}: {
  resource: KeyedResource<CalendarEventListResult>;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;
  const events = resource.data?.events ?? [];
  const hasMore = resource.data?.meta.hasMore ?? false;

  return (
    <ContactSectionState
      status={resource.status}
      onRetry={resource.retry}
      isEmpty={events.length === 0}
      emptyMessage={t("contact360NoEvents", {
        days: UPCOMING_EVENTS_WINDOW_DAYS,
      })}
    >
      <ul className="divide-y divide-slate-100">
        {events.map((event) => {
          // All-day events are a UTC calendar day (like on the Calendar
          // page); timed events are an instant shown in the viewer's
          // timezone. An unparsable date shows a dash, never a crash.
          const when = event.allDay
            ? allDayDate(event.startAt)
            : parseDate(event.startAt);
          const label = when
            ? event.allDay
              ? `${format(when, "PP", { locale })} · ${t("calendarAllDay")}`
              : format(when, "PPp", { locale })
            : NO_DATE;

          return (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {event.title}
                </p>
                <p className="text-xs text-slate-400">{label}</p>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${calendarStatusBadgeClass(event.status)}`}
              >
                {t(CALENDAR_STATUS_LABEL_KEY[event.status] ?? event.status)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-center text-xs text-slate-400">
        {hasMore && (
          <span className="text-amber-600">
            {t("calendarShowingFirstResults")}{" "}
          </span>
        )}
        <Link
          to="/dashboard/calendar"
          className="font-semibold text-blue-600 hover:underline"
        >
          {t("contact360OpenPage", { section: t("calendarNavLabel") })}
        </Link>
      </p>
    </ContactSectionState>
  );
}
