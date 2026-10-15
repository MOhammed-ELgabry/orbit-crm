import type {
  NotificationEntityType,
  NotificationType,
} from '../constants/notification.constants';

/**
 * What a domain service hands to NotificationService.publish().
 *
 * The domain service decides WHAT happened and to WHOM; the notification
 * module decides whether/how it is delivered. `occurrenceId` identifies
 * ONE real-world occurrence of the event and is the basis of the dedupe
 * key (`<type>:<occurrenceId>`):
 *   - Task / Deal / Calendar: the Activity.id logged for that transition
 *     (created exactly once per transition, awaited before publishing).
 *   - Lead (no Activity log): `<leadId>:<newAssigneeId>:<updatedAtMs>` of
 *     the persisted row returned by the very update that caused it.
 */
export interface PublishNotificationInput {
  type: NotificationType;
  companyId: string;
  actorId: string;
  /** Null/undefined/duplicates/the actor are dropped by publish(). */
  recipientIds: ReadonlyArray<string | null | undefined>;
  entityType: NotificationEntityType;
  entityId: string;
  /** Entity title snapshot (sanitized + truncated before storing). */
  title: string;
  occurrenceId: string;
  /** Calendar events only. */
  startAt?: Date;
}

/**
 * What ChatService hands to NotificationService.publishChatMessage().
 *
 * The caller (the chat module) has already derived the recipients on the
 * server from the conversation / audience rules; nothing here comes from a
 * client. `body` is the message text: it is reduced to a bounded, sanitised
 * snippet before anything is stored and is never logged.
 */
export interface PublishChatMessageInput {
  companyId: string;
  /** The sender: never notified, shown as the actor. */
  senderId: string;
  conversationId: string;
  conversationType: 'DIRECT' | 'TEAM';
  messageId: string;
  /** ChatMessage.sequence: orders messages and ties notifications to reads. */
  sequence: number;
  body: string;
  /** Null/undefined/duplicates/the sender are dropped. */
  recipientIds: ReadonlyArray<string | null | undefined>;
}

export interface PublishChatMessageResult {
  /** Recipients whose inbox row was created or advanced by THIS call. */
  notifiedUserIds: string[];
}

/** Small, non-sensitive facts stored in Notification.params. */
export interface NotificationParams {
  title?: string;
  startAt?: string;
  /** Chat only (all strings, JSON-safe). */
  messageId?: string;
  /** Chat only: ChatMessage.sequence as a decimal string. */
  sequence?: string;
  /** Chat only: bounded, sanitised preview; shown in-app only. */
  snippet?: string;
  conversationType?: 'DIRECT' | 'TEAM';
}

/** One inbox item as returned by the API (text already rendered). */
export interface NotificationEntity {
  id: string;
  type: string;
  title: string;
  body: string;
  /** Trusted in-app path (always starts with /dashboard) or null. */
  path: string | null;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string; name: string } | null;
  params: { startAt?: string };
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPreferencesEntity {
  email: boolean;
  push: boolean;
  /** Server-side switches: a channel can be off for the whole deployment. */
  emailAvailable: boolean;
  pushAvailable: boolean;
  devices: Array<{
    id: string;
    label: string | null;
    createdAt: Date;
    lastSuccessAt: Date | null;
  }>;
}
