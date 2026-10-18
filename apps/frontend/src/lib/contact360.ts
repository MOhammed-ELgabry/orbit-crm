import { isTaskOverdue } from "../Components/Task/taskMeta";
import { CLOSED_DEAL_STAGES, type Deal } from "../types/deal";
import { CLOSED_TASK_STATUSES, type Task } from "../types/task";

/**
 * How many records of each source the Customer 360 page asks for. 100 is the
 * backend's maximum page size (PaginationQueryDto @Max(100)); there is no
 * aggregate endpoint, so counts are computed from this one page and flagged
 * as partial when the backend reports more pages.
 */
export const CONTACT_SECTION_LIMIT = 100;

/**
 * Calendar lists are always bounded by a date range, and the backend rejects
 * a range longer than CALENDAR_MAX_QUERY_RANGE_DAYS (92). "Upcoming" is
 * therefore the next 90 days.
 */
export const UPCOMING_EVENTS_WINDOW_DAYS = 90;

/** Shown in place of a date that is missing or cannot be parsed. */
export const NO_DATE = "—";

/**
 * `new Date(value)`, or null when the value is missing or unparsable.
 * date-fns' format()/formatDistanceToNow() THROW a RangeError on an Invalid
 * Date, which during render would take the whole page down; every date shown
 * on the Customer 360 page goes through this first.
 */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * An all-day event is defined by its UTC calendar day (the Calendar page's
 * eventDateKeys uses the UTC day too), so "Oct 21" must read "Oct 21" for
 * every viewer. Returns a local Date carrying the UTC year/month/day, ready
 * to be formatted in the viewer's timezone without shifting the day.
 */
export function allDayDate(value: string | null | undefined): Date | null {
  const date = parseDate(value);

  return date
    ? new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : null;
}

export const isDealOpen = (deal: Pick<Deal, "stage">): boolean =>
  !CLOSED_DEAL_STAGES.includes(deal.stage);

export const isTaskOpen = (task: Pick<Task, "status">): boolean =>
  !CLOSED_TASK_STATUSES.includes(task.status);

/**
 * Exact sum of Deal.amount values (Decimal(12,2) serialised as strings),
 * computed in integer cents so no floating-point error can creep in.
 * Returns null if any value is not a plain decimal string, so the caller
 * shows nothing rather than a wrong number.
 */
export function sumDealAmounts(amounts: readonly string[]): string | null {
  let cents = 0n;

  for (const amount of amounts) {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
    if (!match) return null;

    const value =
      BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0") || "0");
    cents += match[1] ? -value : value;
  }

  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString();
  const fraction = (absolute % 100n).toString().padStart(2, "0");

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export interface OpenDealsSummary {
  /** Open deals among the loaded records (a lower bound when `isPartial`). */
  count: number;
  /** More records exist than were loaded, so `count` is "at least". */
  isPartial: boolean;
  /**
   * Sum of the open deals' amounts. Null unless it is exact: the list is
   * complete, there is at least one open deal and every amount parsed.
   */
  totalValue: string | null;
}

export function summarizeOpenDeals(
  deals: readonly Deal[],
  hasMore: boolean,
): OpenDealsSummary {
  const open = deals.filter(isDealOpen);

  return {
    count: open.length,
    isPartial: hasMore,
    totalValue:
      hasMore || open.length === 0
        ? null
        : sumDealAmounts(open.map((deal) => deal.amount)),
  };
}

export interface OpenTasksSummary {
  count: number;
  overdue: number;
  isPartial: boolean;
}

export function summarizeOpenTasks(
  tasks: readonly Task[],
  hasMore: boolean,
): OpenTasksSummary {
  const open = tasks.filter(isTaskOpen);

  return {
    count: open.length,
    overdue: open.filter(isTaskOverdue).length,
    isPartial: hasMore,
  };
}
