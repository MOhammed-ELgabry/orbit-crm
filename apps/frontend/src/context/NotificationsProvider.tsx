import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "./AuthContext";
import { NotificationsContext } from "./notificationsContext";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService";
import { trackEvent } from "../lib/posthog";
import type { AppNotification } from "../types/notification";

/** Unread-counter poll interval while the tab is visible. */
export const POLL_INTERVAL_MS = 60_000;
/** Backoff ceiling after consecutive poll failures. */
export const MAX_POLL_INTERVAL_MS = 5 * 60_000;

const PAGE_SIZE = 20;

/**
 * Owns the notification state for the signed-in user: the unread badge
 * (polled every 60s, paused while the tab is hidden, exponential backoff
 * on errors) and the list shown by the bell and the Notifications page.
 * There is deliberately no SSE/WebSocket: polling a tiny count endpoint
 * is the approved design.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasError, setHasError] = useState(false);

  const failuresRef = useRef(0);
  // Guards against a slow response from a previous filter/session
  // overwriting the current state.
  const listRequestRef = useRef(0);

  const refreshUnreadCount = useCallback(async () => {
    try {
      setUnreadCount(await getUnreadCount());
      failuresRef.current = 0;
    } catch {
      failuresRef.current += 1;
    }
  }, []);

  // --- Polling -----------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      if (cancelled || document.hidden) return;

      const delay = Math.min(
        POLL_INTERVAL_MS * 2 ** failuresRef.current,
        MAX_POLL_INTERVAL_MS,
      );

      timer = setTimeout(async () => {
        await refreshUnreadCount();
        schedule();
      }, delay);
    };

    const onVisibilityChange = () => {
      if (timer) clearTimeout(timer);

      if (!document.hidden) {
        // Back on the tab: catch up immediately, then resume the cadence.
        void refreshUnreadCount().then(schedule);
      }
    };

    const start = async () => {
      // `await` first: the state update inside refreshUnreadCount then
      // happens async, not synchronously within the effect body (see
      // react-hooks/set-state-in-effect).
      await Promise.resolve();
      await refreshUnreadCount();
      schedule();
    };
    void start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isAuthenticated, refreshUnreadCount]);

  // --- Reset on sign-out (never keep one user's inbox for the next) ------
  useEffect(() => {
    if (isAuthenticated) return;

    listRequestRef.current += 1;
    failuresRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnreadCount(0);
    setItems([]);
    setPage(1);
    setHasMore(false);
    setHasError(false);
  }, [isAuthenticated]);

  // --- List --------------------------------------------------------------
  const loadList = useCallback(async () => {
    const request = ++listRequestRef.current;

    setIsLoading(true);
    setHasError(false);

    try {
      const result = await listNotifications({
        page: 1,
        limit: PAGE_SIZE,
      });

      if (request !== listRequestRef.current) return;

      setItems(result.notifications);
      setPage(1);
      setHasMore(result.meta.hasNextPage);
      void refreshUnreadCount();
    } catch {
      if (request === listRequestRef.current) setHasError(true);
    } finally {
      if (request === listRequestRef.current) setIsLoading(false);
    }
  }, [refreshUnreadCount]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    const request = listRequestRef.current;
    setIsLoadingMore(true);

    try {
      const result = await listNotifications({
        page: page + 1,
        limit: PAGE_SIZE,
      });

      if (request !== listRequestRef.current) return;

      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...result.notifications.filter((item) => !known.has(item.id)),
        ];
      });
      setPage(page + 1);
      setHasMore(result.meta.hasNextPage);
    } catch {
      setHasError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, page]);

  // --- Mutations (optimistic, reconciled with the server on failure) -----
  const markRead = useCallback(
    async (id: string) => {
      const target = items.find((item) => item.id === id);
      if (!target || target.readAt) return;

      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, readAt } : item)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));

      try {
        await markNotificationRead(id);
      } catch {
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, readAt: null } : item,
          ),
        );
        void refreshUnreadCount();
      }
    },
    [items, refreshUnreadCount],
  );

  const markAllRead = useCallback(async () => {
    const previous = items;
    const readAt = new Date().toISOString();

    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt })),
    );
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
      trackEvent("notifications_mark_all_read");
    } catch {
      setItems(previous);
      void refreshUnreadCount();
    }
  }, [items, refreshUnreadCount]);

  const value = useMemo(
    () => ({
      unreadCount,
      items,
      hasMore,
      isLoading,
      isLoadingMore,
      hasError,
      loadList,
      loadMore,
      markRead,
      markAllRead,
      refreshUnreadCount,
    }),
    [
      unreadCount,
      items,
      hasMore,
      isLoading,
      isLoadingMore,
      hasError,
      loadList,
      loadMore,
      markRead,
      markAllRead,
      refreshUnreadCount,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}