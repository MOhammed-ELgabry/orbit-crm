import { useContext } from "react";

import {
  NotificationsContext,
  type NotificationsContextValue,
} from "../context/notificationsContext";

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error(
      "useNotifications must be used inside <NotificationsProvider>.",
    );
  }

  return context;
}