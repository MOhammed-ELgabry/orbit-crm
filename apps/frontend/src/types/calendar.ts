/**

* Mirrors backend/src/modules/calendar/entities/calendar-event.entity.ts
* and its DTOs exactly — field-for-field, including which fields are
* nullable vs optional-on-write. Keep these two in sync by hand; there
* is no shared-types package between the two apps in this repo (see
* types/task.ts for the same note).
  */

/** Mirrors CALENDAR_EVENT_STATUSES (backend calendar.constants.ts). */
export const CALENDAR_EVENT_STATUSES = [
"scheduled",
"completed",
"cancelled",
] as const;

export type CalendarEventStatus = (typeof CALENDAR_EVENT_STATUSES)[number];

export const CLOSED_CALENDAR_EVENT_STATUSES: readonly CalendarEventStatus[] = [
"completed",
"cancelled",
];

export interface CalendarEvent {
id: string;
companyId: string;

title: string;
description: string | null;
location: string | null;

startAt: string;
endAt: string;
allDay: boolean;
status: CalendarEventStatus;

contactId: string | null;
leadId: string | null;
dealId: string | null;

createdById: string;
assignedToId: string | null;

createdAt: string;
updatedAt: string;
deletedAt: string | null;
}

export interface CreateCalendarEventInput {
title: string;
description?: string;
location?: string;
startAt: string;
endAt: string;
allDay?: boolean;
contactId?: string;
leadId?: string;
dealId?: string;
assignedToId?: string;
}

/**

* Unlike CreateCalendarEventInput, description/location and the 4
* relation fields here accept `null` explicitly — a cleared field or
* dropdown must be sent as `null`, not omitted, or the backend has no
* way to distinguish "clear this" from "leave it alone" (both
* UpdateCalendarEventDto and CalendarEventRepository.update rely on
* `undefined` meaning the latter). See CalendarEventFormModal's submit
* handler for where this is applied. startAt/endAt/allDay are never
* nullable even here — an event's timing can be changed but never unset.
  */
 export type UpdateCalendarEventInput = Partial<
  Omit<
    CreateCalendarEventInput,
    | "description"
    | "location"
    | "contactId"
    | "leadId"
    | "dealId"
    | "assignedToId"
  >
> & {
  description?: string | null;
  location?: string | null;
  status?: CalendarEventStatus;
  contactId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
  assignedToId?: string | null;
};
export interface CalendarEventQuery {
from: string;
to: string;
status?: CalendarEventStatus;
assignedToId?: string;
contactId?: string;
leadId?: string;
dealId?: string;
}

export interface CalendarEventListMeta {
from: string;
to: string;
limit: number;
hasMore: boolean;
}
