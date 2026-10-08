import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { useNotifications } from "./useNotifications";
import { safeDashboardPath } from "../lib/notificationLinks";
import { trackEvent } from "../lib/posthog";
import type { AppNotification } from "../types/notification";

/**
 * Shared "user activated a notification" behaviour for the bell and the
 * page: mark it read, record the (type-only) analytics event, then go to
 * the entity — but only to a validated /dashboard path.
 */
export function useOpenNotification(onAfterOpen?: () => void) {
  const { markRead } = useNotifications();
  const navigate = useNavigate();

  return useCallback(
    (notification: AppNotification) => {
      trackEvent("notification_opened", { type: notification.type });
      void markRead(notification.id);

      const target = safeDashboardPath(notification.path);
      if (target) navigate(target);

      onAfterOpen?.();
    },
    [markRead, navigate, onAfterOpen],
  );
}