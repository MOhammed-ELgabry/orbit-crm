import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ar, enUS } from "date-fns/locale";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type { CalendarEvent } from "../../types/calendar";
import { eventDateKeys, localDateKey } from "./calendarDates";
import { calendarStatusBadgeClass, isCalendarEventPastDue } from "./calendarMeta";

interface CalendarMonthGridProps {
  visibleMonth: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  /** "+N more" and clicking a day with no room left both go through here. */
  onShowDay: (date: Date) => void;
}

const MAX_VISIBLE_PER_DAY = 3;

export default function CalendarMonthGrid({
  visibleMonth,
  events,
  onSelectEvent,
  onShowDay,
}: CalendarMonthGridProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? ar : enUS;

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [visibleMonth]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      for (const key of eventDateKeys(event)) {
        const bucket = map.get(key);
        if (bucket) {
          bucket.push(event);
        } else {
          map.set(key, [event]);
        }
      }
    }
    return map;
  }, [events]);

  const weekdayLabels = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(weekStart, i), "EEEEEE", { locale }),
    );
  }, [locale]);

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-7 border-b border-slate-100 pb-2 text-center text-xs font-semibold text-slate-400">
        {weekdayLabels.map((label, i) => (
          <div key={i}>{label}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-slate-100">
        {days.map((day) => {
          const key = localDateKey(day);
          const dayEvents = eventsByDay.get(key) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
          const overflowCount = dayEvents.length - visible.length;
          const inMonth = isSameMonth(day, visibleMonth);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onShowDay(day)}
              className={`flex min-h-[92px] flex-col items-stretch gap-1 bg-white p-1.5 text-start sm:min-h-[110px] ${
                inMonth ? "" : "bg-slate-50 text-slate-300"
              }`}
            >
              <span
                className={`self-start rounded-full px-1.5 text-xs font-semibold ${
                  isToday(day)
                    ? "bg-[#605BFF] text-white"
                    : inMonth
                      ? "text-slate-600"
                      : "text-slate-300"
                }`}
              >
                {format(day, "d")}
              </span>

              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                {visible.map((event) => (
                  <span
                    key={event.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(event);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        onSelectEvent(event);
                      }
                    }}
                    title={event.title}
                    className={`truncate rounded px-1 py-0.5 text-start text-[11px] font-medium ${
                      isCalendarEventPastDue(event)
                        ? "bg-amber-100 text-amber-700"
                        : calendarStatusBadgeClass(event.status)
                    } ${event.status === "cancelled" ? "line-through opacity-70" : ""}`}
                  >
                    {!event.allDay && (
                      <span className="me-1 opacity-70">
                        {format(new Date(event.startAt), "HH:mm")}
                      </span>
                    )}
                    {event.title}
                  </span>
                ))}

                {overflowCount > 0 && (
                  <span className="text-start text-[11px] font-semibold text-slate-400">
                    {t("calendarMoreEvents", { count: overflowCount })}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}