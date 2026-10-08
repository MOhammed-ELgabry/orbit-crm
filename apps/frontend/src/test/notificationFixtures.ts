import type {
  AppNotification,
  NotificationPreferences,
} from "../types/notification";

let sequence = 0;

export function makeNotification(
  overrides: Partial<AppNotification> = {},
): AppNotification {
  sequence += 1;

  return {
    id: `n-${sequence}`,
    type: "task.assigned",
    title: `Title ${sequence}`,
    body: `Body ${sequence}`,
    path: "/dashboard/tasks",
    entityType: "task",
    entityId: `t-${sequence}`,
    actor: { id: "u-actor", name: "Sara" },
    params: {},
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makePreferences(
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences {
  return {
    email: true,
    push: false,
    emailAvailable: true,
    pushAvailable: true,
    devices: [],
    ...overrides,
  };
}

export function listResult(
  notifications: AppNotification[],
  hasNextPage = false,
) {
  return {
    notifications,
    meta: {
      page: 1,
      limit: 20,
      total: notifications.length,
      totalPages: hasNextPage ? 2 : 1,
      hasNextPage,
      hasPreviousPage: false,
    },
  };
}