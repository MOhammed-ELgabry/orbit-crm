export const CALENDAR_REPOSITORY = Symbol('CALENDAR_REPOSITORY');

/**
 * Whitelist of valid CalendarEvent.status values. Same deliberate
 * choice as TASK_STATUSES/CLOSED_TASK_STATUSES: enforced only at the
 * application layer, not as a database enum, so the lifecycle can be
 * adjusted without a migration. Unlike Task, there is no separate
 * "in_progress" state and no completedAt column — a Calendar event's
 * status is enough on its own for Phase 1.
 */
export const CALENDAR_EVENT_STATUSES = [
  'scheduled',
  'completed',
  'cancelled',
] as const;

/** The 2 terminal statuses — mirrors CLOSED_TASK_STATUSES. */
export const CLOSED_CALENDAR_EVENT_STATUSES = [
  'completed',
  'cancelled',
] as const;

/**
 * A single event may span at most this many days (inclusive of both
 * endpoints for a timed event; for an all-day event this bounds
 * endAt - startAt, where endAt is the exclusive end date). Keeping
 * this bounded is what makes the list-range query below safe to
 * express as an index range scan rather than a full-table scan on
 * endAt — see CalendarEventRepository.findAll for exactly how.
 */
export const CALENDAR_MAX_EVENT_DURATION_DAYS = 31;

/**
 * A single GET /calendar list call may request at most this many days
 * between from/to. Bounded for the same reason a maximum page size
 * exists elsewhere — an unbounded range on a company with years of
 * history would be an expensive, unnecessary scan for a UI that only
 * ever renders one month or one agenda window at a time.
 */
export const CALENDAR_MAX_QUERY_RANGE_DAYS = 92;

/**
 * findAll fetches one more row than this to detect hasMore without a
 * separate count query, then trims back down to this many before
 * returning. See CalendarEventRepository.findAll.
 */
export const CALENDAR_LIST_MAX_RESULTS = 500;
