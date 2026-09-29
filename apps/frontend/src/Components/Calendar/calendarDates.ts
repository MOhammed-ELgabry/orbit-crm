import type { CalendarEvent } from "../../types/calendar";

const pad = (n: number): string => String(n).padStart(2, "0");

/**

* For a <input type="datetime-local"> value — local wall-clock time,
* no timezone suffix. Mirrors ActivityTimeline's toDatetimeLocalValue
* exactly (Components/Activity/ActivityTimeline.tsx).
  */
  export function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
   date.getDate(),
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

/**

* A <input type="datetime-local"> value has no timezone suffix, so
* `new Date(value)` is parsed as browser-local time — exactly the
* instant the picker showed. Converting that to ISO is then a correct
* UTC instant with no further work.
  */
  export function datetimeLocalToIso(value: string): string {
  return new Date(value).toISOString();
  }

interface DateOnlyParts {
year: number;
month: number; // 0-indexed, matches Date's own convention
day: number;
}

function parseDateOnly(value: string): DateOnlyParts {
const [year, month, day] = value.split("-").map(Number);
return { year, month: month - 1, day };
}

/**

* The following 4 functions are the only place allowed to convert
* between an all-day event's wire representation (UTC-midnight
* startAt, exclusive-UTC-midnight endAt — CalendarService enforces
* this server-side) and the two separate <input type="date"> values a
* person actually edits (an inclusive start date and an inclusive end
* date). Every conversion here uses Date.UTC / getUTC* exclusively —
* never `new Date(y, m, d)` or `date.getDate()` — so a browser whose
* local timezone sits on the other side of midnight from UTC can never
* shift an all-day event onto the wrong calendar day. This is the
* concrete mechanism behind the "no accidental day shifting"
* requirement for all-day events.
  */
  export function allDayStartInputToIso(dateOnly: string): string {
  const { year, month, day } = parseDateOnly(dateOnly);
  return new Date(Date.UTC(year, month, day)).toISOString();
  }

export function allDayInclusiveEndInputToIso(dateOnly: string): string {
// The wire format's endAt is an EXCLUSIVE date — the day after the
// last day the event covers. Date.UTC correctly rolls day + 1 over
// into the next month (or year) when the input is the last day of one.
const { year, month, day } = parseDateOnly(dateOnly);
return new Date(Date.UTC(year, month, day + 1)).toISOString();
}

export function isoToAllDayStartInput(iso: string): string {
const date = new Date(iso);
return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

export function isoToAllDayInclusiveEndInput(iso: string): string {
const date = new Date(iso);
// exclusive end - 1 day, entirely in UTC arithmetic.
const inclusive = new Date(
Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1),
);
return `${inclusive.getUTCFullYear()}-${pad(
    inclusive.getUTCMonth() + 1,
  )}-${pad(inclusive.getUTCDate())}`;
}

/** 'YYYY-MM-DD' key from a Date's LOCAL calendar day — for timed events. */
export function localDateKey(date: Date): string {
return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

/** 'YYYY-MM-DD' key from a Date's UTC calendar day — for all-day events. */
export function utcDateKey(date: Date): string {
return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

/**

* Every 'YYYY-MM-DD' key this event should render under in the month
* grid. An all-day event's keys come from its UTC calendar days (so
* "Oct 1" shows on Oct 1 for every viewer, in every timezone, matching
* how the backend defines the date) — a timed event's keys come from
* its LOCAL calendar days (so it shows on whatever day it falls on for
* *this* viewer, which is what a wall-clock time means). Capped at 32
* days as a hard backstop — CalendarService already rejects anything
* over 31, so this only ever bites on already-invalid data.
  */
  export function eventDateKeys(
  event: Pick<CalendarEvent, "startAt" | "endAt" | "allDay">,
  ): string[] {
  const keys: string[] = [];
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);

if (event.allDay) {
const cursor = new Date(
Date.UTC(
start.getUTCFullYear(),
start.getUTCMonth(),
start.getUTCDate(),
),
);
const stop = new Date(
Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
);


for (let i = 0; cursor.getTime() < stop.getTime() && i < 32; i++) {
  keys.push(utcDateKey(cursor));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}

return keys;


}

const cursor = new Date(
start.getFullYear(),
start.getMonth(),
start.getDate(),
);

const endDay = new Date(
end.getFullYear(),
end.getMonth(),
end.getDate(),
);

// endAt is an exclusive instant. If it falls exactly at the start
// of a local calendar day, that day is not covered by the event.
// Otherwise the event does cover endAt's local calendar day.
const endIsExactlyAtStartOfDay =
end.getHours() === 0 &&
end.getMinutes() === 0 &&
end.getSeconds() === 0 &&
end.getMilliseconds() === 0;

const lastDay = endIsExactlyAtStartOfDay
? new Date(endDay.getTime() - 1)
: endDay;

for (let i = 0; i < 32; i++) {
keys.push(localDateKey(cursor));


if (
  cursor.getFullYear() === lastDay.getFullYear() &&
  cursor.getMonth() === lastDay.getMonth() &&
  cursor.getDate() === lastDay.getDate()
) {
  break;
}

cursor.setDate(cursor.getDate() + 1);


}

return keys;
}
