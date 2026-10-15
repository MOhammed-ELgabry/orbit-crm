import { useEffect } from "react";

import { useChat } from "../../hooks/useChat";
import { useNotifications } from "../../hooks/useNotifications";
import { createCoalescedRefresh } from "../../lib/coalescedRefresh";

/**
 * How long to wait before re-reading the unread counter after chat
 * activity. The server creates the chat notification right AFTER the
 * message is committed (not inside the request), so an immediate read could
 * miss it; ~1.2s covers that gap and also merges bursts into one request.
 */
export const CHAT_NOTIFICATION_REFRESH_DELAY_MS = 1_200;

/**
 * Renders nothing. Connects the EXISTING chat socket (through
 * `ChatStore.subscribeActivity`) to the notifications counter so a new
 * message shows up in the bell within about a second instead of waiting for
 * the 60s poll, and so reading a conversation lowers the bell counter
 * promptly. It opens no connection of its own, keeps the polling as the
 * safety net (reconnects, missed events), and cannot affect sending or
 * receiving chat messages: it only observes, and every failure is swallowed.
 */
export default function ChatNotificationsBridge() {
  const { store } = useChat();
  const { refreshUnreadCount } = useNotifications();

  useEffect(() => {
    const refresher = createCoalescedRefresh(
      () => refreshUnreadCount(),
      CHAT_NOTIFICATION_REFRESH_DELAY_MS,
      // A hidden tab catches up on `visibilitychange` (see the provider).
      () => !document.hidden,
    );

    const unsubscribe = store.subscribeActivity(() => refresher.request());

    return () => {
      unsubscribe();
      refresher.cancel();
    };
  }, [store, refreshUnreadCount]);

  return null;
}
