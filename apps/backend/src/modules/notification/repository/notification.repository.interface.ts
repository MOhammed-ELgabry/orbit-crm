import type {
  NotificationEntityType,
  NotificationPreferenceChannel,
  NotificationType,
} from '../constants/notification.constants';

// ---------------------------------------------------------------------
// Row shapes returned by the repository (never leaked past the service)
// ---------------------------------------------------------------------

export interface NotificationRow {
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  params: unknown;
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string; firstName: string; lastName: string } | null;
}

export interface EligibleRecipient {
  id: string;
  language: string;
}

export interface DisabledChannel {
  userId: string;
  channel: string;
}

export interface PushSubscriptionRow {
  id: string;
  userId: string;
  userAgent: string | null;
  createdAt: Date;
  lastSuccessAt: Date | null;
}

export interface PushSubscriptionTarget {
  id: string;
  userId: string;
}

/** Full row incl. secrets — ONLY used by the worker, never by an API. */
export interface PushSubscriptionSendRow {
  id: string;
  companyId: string;
  userId: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

export interface CreateNotificationInput {
  companyId: string;
  userId: string;
  actorId: string;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  params: Record<string, string>;
  dedupeKey: string;
  deliveries: Array<{ channel: 'email' | 'push'; target: string }>;
}

export interface UpsertPushSubscriptionInput {
  companyId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface ClaimedDelivery {
  id: string;
  notificationId: string;
  channel: string;
  target: string;
  /** Attempt number of THIS claim (already incremented). */
  attempts: number;
}

export interface DeliveryContext {
  delivery: {
    id: string;
    channel: string;
    target: string;
    attempts: number;
  };
  notification: {
    id: string;
    companyId: string;
    userId: string;
    type: string;
    entityType: string | null;
    entityId: string | null;
    params: unknown;
    createdAt: Date;
    actor: { firstName: string; lastName: string } | null;
  };
  recipient: {
    id: string;
    email: string;
    language: string;
    companyId: string | null;
    isActive: boolean;
    deletedAt: Date | null;
  };
}

/**
 * Every method that touches user-visible data takes BOTH companyId and
 * userId taken from the verified JWT. A missing row and a row that
 * belongs to another user/tenant are indistinguishable to callers.
 */
export interface INotificationRepository {
  // Inbox ---------------------------------------------------------------
  findManyForUser(
    companyId: string,
    userId: string,
    options: { skip: number; take: number; unreadOnly: boolean },
  ): Promise<{ items: NotificationRow[]; total: number }>;

  countUnread(companyId: string, userId: string): Promise<number>;

  /** True if the notification exists for this user+tenant. */
  markRead(companyId: string, userId: string, id: string): Promise<boolean>;

  markAllRead(companyId: string, userId: string): Promise<number>;

  findUserLanguage(companyId: string, userId: string): Promise<string>;

  // Publishing ----------------------------------------------------------
  findEligibleRecipients(
    companyId: string,
    userIds: string[],
  ): Promise<EligibleRecipient[]>;

  findDisabledChannels(
    companyId: string,
    userIds: string[],
  ): Promise<DisabledChannel[]>;

  findPushSubscriptionTargets(
    companyId: string,
    userIds: string[],
  ): Promise<PushSubscriptionTarget[]>;

  /** Null when (userId, dedupeKey) already exists (duplicate occurrence). */
  createWithDeliveries(
    input: CreateNotificationInput,
  ): Promise<{ id: string } | null>;

  // Preferences ---------------------------------------------------------
  getChannelPreferences(
    companyId: string,
    userId: string,
  ): Promise<Partial<Record<NotificationPreferenceChannel, boolean>>>;

  upsertChannelPreference(
    companyId: string,
    userId: string,
    channel: NotificationPreferenceChannel,
    enabled: boolean,
  ): Promise<void>;

  // Push subscriptions --------------------------------------------------
  listPushSubscriptions(
    companyId: string,
    userId: string,
  ): Promise<PushSubscriptionRow[]>;

  upsertPushSubscription(
    input: UpsertPushSubscriptionInput,
    maxPerUser: number,
  ): Promise<{ id: string }>;

  deletePushSubscriptionByEndpoint(
    companyId: string,
    userId: string,
    endpoint: string,
  ): Promise<number>;

  // Worker --------------------------------------------------------------
  claimDeliveries(
    now: Date,
    staleBefore: Date,
    limit: number,
  ): Promise<ClaimedDelivery[]>;

  loadDeliveryContext(deliveryId: string): Promise<DeliveryContext | null>;

  findPushSubscriptionForSend(
    id: string,
  ): Promise<PushSubscriptionSendRow | null>;

  hasActiveSession(userId: string, now: Date): Promise<boolean>;

  countEmailsSentSince(userId: string, since: Date): Promise<number>;

  markDeliverySent(id: string, attempts: number, now: Date): Promise<boolean>;

  markDeliverySkipped(
    id: string,
    attempts: number,
    code: string,
  ): Promise<boolean>;

  markDeliveryFailed(
    id: string,
    attempts: number,
    code: string,
  ): Promise<boolean>;

  /** Back to `pending` for a later attempt; the attempt stays counted. */
  scheduleDeliveryRetry(
    id: string,
    attempts: number,
    nextAttemptAt: Date,
    code: string,
  ): Promise<boolean>;

  /** Back to `pending` WITHOUT consuming the attempt (rate limiting). */
  deferDelivery(
    id: string,
    attempts: number,
    nextAttemptAt: Date,
    code: string,
  ): Promise<boolean>;

  recordPushSuccess(id: string, now: Date): Promise<void>;

  /** Increments failureCount; deletes the subscription at `maxFailures`. */
  recordPushFailure(id: string, now: Date, maxFailures: number): Promise<void>;

  /** Removes a dead (404/410) subscription. */
  deletePushSubscriptionById(id: string): Promise<void>;

  // Cleanup -------------------------------------------------------------
  deleteNotificationsOlderThan(
    before: Date,
    batchSize: number,
  ): Promise<number>;
}
