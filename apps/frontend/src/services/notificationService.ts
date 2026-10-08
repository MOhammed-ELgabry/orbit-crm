import api from "./api";
import type {
  ApiEnvelope,
  PaginatedEnvelope,
  PaginationMeta,
} from "../types/api";
import type {
  AppNotification,
  NotificationChannel,
  NotificationPreferences,
  NotificationQuery,
  PushSubscriptionPayload,
} from "../types/notification";

export interface NotificationListResult {
  notifications: AppNotification[];
  meta: PaginationMeta;
}

export const listNotifications = async (
  query: NotificationQuery = {},
): Promise<NotificationListResult> => {
  const response = await api.get<PaginatedEnvelope<AppNotification>>(
    "/notifications",
    { params: query },
  );

  return { notifications: response.data.data, meta: response.data.meta };
};

export const getUnreadCount = async (): Promise<number> => {
  const response = await api.get<ApiEnvelope<{ count: number }>>(
    "/notifications/unread-count",
  );
  return response.data.data.count;
};

export const markNotificationRead = async (id: string): Promise<void> => {
  await api.patch(`/notifications/${encodeURIComponent(id)}/read`);
};

export const markAllNotificationsRead = async (): Promise<number> => {
  const response = await api.post<ApiEnvelope<{ updated: number }>>(
    "/notifications/read-all",
  );
  return response.data.data.updated;
};

export const getNotificationPreferences =
  async (): Promise<NotificationPreferences> => {
    const response = await api.get<ApiEnvelope<NotificationPreferences>>(
      "/notifications/preferences",
    );
    return response.data.data;
  };

export const updateNotificationPreference = async (
  channel: NotificationChannel,
  enabled: boolean,
): Promise<NotificationPreferences> => {
  const response = await api.put<ApiEnvelope<NotificationPreferences>>(
    "/notifications/preferences",
    { channel, enabled },
  );
  return response.data.data;
};

export const getPushPublicKey = async (): Promise<string> => {
  const response = await api.get<ApiEnvelope<{ publicKey: string }>>(
    "/notifications/push/public-key",
  );
  return response.data.data.publicKey;
};

export const subscribePush = async (
  subscription: PushSubscriptionPayload,
): Promise<void> => {
  await api.post("/notifications/push/subscribe", subscription);
};

export const unsubscribePush = async (endpoint: string): Promise<void> => {
  await api.post("/notifications/push/unsubscribe", { endpoint });
};