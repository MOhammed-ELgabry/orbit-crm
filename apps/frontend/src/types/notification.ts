/**
 * Mirrors backend modules/notification/entities/notification.entity.ts.
 * Text (title/body) is already rendered by the server in the user's
 * language; the client never builds notification text itself.
 */
export interface AppNotification {
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
  readAt: string | null;
  createdAt: string;
}

export interface NotificationQuery {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface NotificationDevice {
  id: string;
  label: string | null;
  createdAt: string;
  lastSuccessAt: string | null;
}

export type NotificationChannel = "email" | "push";

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  /** Server-side switches: a channel can be off for the whole deployment. */
  emailAvailable: boolean;
  pushAvailable: boolean;
  devices: NotificationDevice[];
}

/** Shape of PushSubscription.toJSON() that the backend accepts. */
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}