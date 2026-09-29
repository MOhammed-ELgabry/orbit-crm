import type { CalendarEvent, CalendarEventStatus } from "../../types/calendar";
import { CLOSED_CALENDAR_EVENT_STATUSES } from "../../types/calendar";

export const CALENDAR_STATUS_LABEL_KEY: Record<CalendarEventStatus, string> = {
  scheduled: "calendarStatusScheduled",
  completed: "calendarStatusCompleted",
  cancelled: "calendarStatusCancelled",
};

/**
 * Status is communicated by icon + text label wherever it's shown, not
 * by this color alone — see CalendarAgenda/CalendarMonthGrid for the
 * accompanying icon.
 */
export function calendarStatusBadgeClass(status: CalendarEventStatus): string {
  switch (status) {
    case "scheduled":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/**
 * A scheduled event whose end has already passed gets its own amber
 * treatment (distinct from the blue "scheduled" badge) so a
 * never-updated past event is visually distinguishable from an
 * upcoming one — purely a display computation, not a stored status.
 * Mirrors isTaskOverdue's shape: "now" is read fresh on every call.
 */
export function isCalendarEventPastDue(
  event: Pick<CalendarEvent, "endAt" | "status">,
): boolean {
  if (CLOSED_CALENDAR_EVENT_STATUSES.includes(event.status)) return false;
  return new Date(event.endAt).getTime() < Date.now();
}