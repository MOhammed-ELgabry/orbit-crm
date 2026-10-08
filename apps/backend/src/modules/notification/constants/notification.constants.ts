export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

/**
 * The only notification types that exist. Enforced only at the
 * application layer (not a database enum), like TASK_STATUSES /
 * DEAL_STAGES: adding a type never requires a migration.
 *
 * Deliberately small: a notification means "someone else did something
 * that concerns you", never "something was saved". Activity-log entries,
 * plain CRUD edits, unassignments, logins and account events are NOT
 * notifications.
 */
export const NOTIFICATION_TYPES = [
  'task.assigned',
  'task.completed',
  'deal.assigned',
  'deal.won',
  'deal.lost',
  'lead.assigned',
  'calendar.assigned',
  'calendar.rescheduled',
  'calendar.cancelled',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Entities a notification may point at (also the deep-link allowlist). */
export const NOTIFICATION_ENTITY_TYPES = [
  'task',
  'deal',
  'lead',
  'calendar_event',
] as const;

export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];

/**
 * Channels a user can opt out of. "internal" is intentionally absent:
 * the in-app inbox is always on.
 */
export const NOTIFICATION_PREFERENCE_CHANNELS = ['email', 'push'] as const;

export type NotificationPreferenceChannel =
  (typeof NOTIFICATION_PREFERENCE_CHANNELS)[number];

/** Preference `type` meaning "all event types". The only value used today. */
export const ALL_NOTIFICATION_TYPES = '*';

export const DELIVERY_STATUSES = [
  'pending',
  'processing',
  'sent',
  'failed',
  'skipped',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * Which external channels each type is eligible for. Internal is always
 * on for every type. High-signal "this is now yours / this changed"
 * events can email/push; outcome-style events stay in-app only.
 */
export const NOTIFICATION_TYPE_CHANNELS: Record<
  NotificationType,
  { email: boolean; push: boolean }
> = {
  'task.assigned': { email: true, push: true },
  'task.completed': { email: false, push: false },
  'deal.assigned': { email: true, push: true },
  'deal.won': { email: false, push: false },
  'deal.lost': { email: false, push: false },
  'lead.assigned': { email: true, push: true },
  'calendar.assigned': { email: true, push: false },
  'calendar.rescheduled': { email: true, push: true },
  'calendar.cancelled': { email: true, push: true },
};

/** Sanitized entity title stored in Notification.params. */
export const MAX_TITLE_LENGTH = 120;

// ---------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------
export const INBOX_MAX_PAGE_SIZE = 50;
export const INBOX_DEFAULT_PAGE_SIZE = 20;

/** Notifications older than this are deleted by the worker's cleanup. */
export const NOTIFICATION_RETENTION_DAYS = 90;

// ---------------------------------------------------------------------
// Push subscriptions
// ---------------------------------------------------------------------
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;
export const MAX_PUSH_ENDPOINT_LENGTH = 2048;
export const MAX_USER_AGENT_LENGTH = 255;
/** A subscription whose pushes keep being rejected is dropped after this. */
export const PUSH_MAX_FAILURE_COUNT = 5;
export const PUSH_TTL_SECONDS = 6 * 60 * 60;
export const PUSH_SEND_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------
// Delivery worker (CURRENT IMPLEMENTATION: in-process, PostgreSQL-backed;
// see NotificationWorker for the documented migration path)
// ---------------------------------------------------------------------
export const WORKER_TICK_MS = 10_000;
export const WORKER_CLAIM_BATCH_SIZE = 20;
export const WORKER_CONCURRENCY = 5;
export const WORKER_MAX_BATCHES_PER_TICK = 5;
/** A `processing` row older than this is presumed orphaned by a crash. */
export const DELIVERY_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
/** A delivery older than this is never sent (stale news is noise). */
export const DELIVERY_EXPIRY_MS = 24 * 60 * 60 * 1000;

const MINUTE = 60 * 1000;

/** Delay before the Nth retry (index = attempts made - 1). */
export const EMAIL_RETRY_BACKOFF_MS = [
  1 * MINUTE,
  5 * MINUTE,
  30 * MINUTE,
  120 * MINUTE,
] as const;
export const EMAIL_MAX_ATTEMPTS = EMAIL_RETRY_BACKOFF_MS.length + 1;

export const PUSH_RETRY_BACKOFF_MS = [1 * MINUTE, 5 * MINUTE] as const;
export const PUSH_MAX_ATTEMPTS = PUSH_RETRY_BACKOFF_MS.length + 1;

/** Max notification emails actually sent per user per rolling hour. */
export const EMAIL_RATE_LIMIT_PER_HOUR = 10;

export const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const CLEANUP_BATCH_SIZE = 1000;
export const CLEANUP_MAX_BATCHES = 20;
