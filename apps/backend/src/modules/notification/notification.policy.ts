import {
  DELIVERY_EXPIRY_MS,
  EMAIL_MAX_ATTEMPTS,
  EMAIL_RETRY_BACKOFF_MS,
  NOTIFICATION_TYPE_CHANNELS,
  PUSH_MAX_ATTEMPTS,
  PUSH_RETRY_BACKOFF_MS,
  type NotificationType,
} from './constants/notification.constants';

/**
 * Pure decision functions (no I/O) so the rules that matter — dedupe
 * identity, which channels fire, and retry timing — are unit-testable in
 * isolation and shared verbatim by NotificationService and
 * NotificationWorker.
 */

/** One real-world occurrence of an event, per recipient. */
export function buildDedupeKey(
  type: NotificationType,
  occurrenceId: string,
): string {
  return `${type}:${occurrenceId}`;
}

/**
 * Lead has no Activity log, so its occurrence id is derived from the
 * persisted row produced by the very update that caused the event:
 * `<leadId>:<newAssigneeId>:<updatedAtMs>`. Re-assigning to the same
 * person later changes updatedAt, so that is a (legitimately) new
 * occurrence, while a replayed/duplicated publish of the SAME update
 * collapses.
 */
export function buildLeadOccurrenceId(
  leadId: string,
  assigneeId: string,
  updatedAt: Date,
): string {
  return `${leadId}:${assigneeId}:${updatedAt.getTime()}`;
}

export interface ChannelDecisionInput {
  type: NotificationType;
  emailEnabledGlobally: boolean;
  pushAvailable: boolean;
  /** Channels this user opted out of ("email" | "push"). */
  disabledChannels: ReadonlySet<string>;
  /** The user's registered push subscription ids. */
  pushSubscriptionIds: ReadonlyArray<string>;
}

export interface DeliverySpec {
  channel: 'email' | 'push';
  target: string;
}

/**
 * Internal notifications are always created; this decides the EXTERNAL
 * deliveries. Email: type eligible AND deployment flag on AND user did
 * not opt out. Push: type eligible AND VAPID configured AND user did not
 * opt out; one delivery per device.
 */
export function decideDeliveries(input: ChannelDecisionInput): DeliverySpec[] {
  const eligible = NOTIFICATION_TYPE_CHANNELS[input.type];
  const deliveries: DeliverySpec[] = [];

  if (
    eligible.email &&
    input.emailEnabledGlobally &&
    !input.disabledChannels.has('email')
  ) {
    deliveries.push({ channel: 'email', target: 'default' });
  }

  if (
    eligible.push &&
    input.pushAvailable &&
    !input.disabledChannels.has('push')
  ) {
    for (const id of input.pushSubscriptionIds) {
      deliveries.push({ channel: 'push', target: id });
    }
  }

  return deliveries;
}

export function maxAttemptsFor(channel: string): number {
  return channel === 'push' ? PUSH_MAX_ATTEMPTS : EMAIL_MAX_ATTEMPTS;
}

/**
 * Delay before the next attempt after `attemptsMade` failed attempts, or
 * null when no attempts remain (the delivery becomes `failed`).
 */
export function nextRetryDelayMs(
  channel: string,
  attemptsMade: number,
): number | null {
  const backoff =
    channel === 'push' ? PUSH_RETRY_BACKOFF_MS : EMAIL_RETRY_BACKOFF_MS;

  if (attemptsMade < 1 || attemptsMade > backoff.length) return null;

  return backoff[attemptsMade - 1];
}

export function isDeliveryExpired(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > DELIVERY_EXPIRY_MS;
}
