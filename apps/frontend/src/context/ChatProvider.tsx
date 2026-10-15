import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useAuth } from "./AuthContext";
import { ChatContext } from "./chatContext";
import { selectConversationList, selectTotalUnread } from "./chatState";
import { ChatStore } from "./chatStore";

/**
 * Owns the Team Chat store of the signed-in user: REST bootstrap plus the
 * real-time socket, started only while authenticated and torn down (socket,
 * timers, listeners) on sign-out. A new store is created per user id, so one
 * user's conversations can never be shown to the next person who signs in
 * on the same browser. There is no chat permission: availability is decided
 * by the server (a 403 hides the entry point), exactly like notifications.
 */
export function ChatProvider({
  children,
  store: injectedStore,
}: {
  children: ReactNode;
  /** Test seam: supply a pre-built store. */
  store?: ChatStore;
}) {
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id ?? null;

  // A fresh store for every distinct user (never reused across accounts).
  const ownStore = useMemo(
    () => new ChatStore(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userId is the intentional identity key
    [userId],
  );
  const store = injectedStore ?? ownStore;

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    store.start();

    return () => store.stop();
  }, [isAuthenticated, store]);

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const value = useMemo(
    () => ({
      state,
      store,
      totalUnread: selectTotalUnread(state),
      conversations: selectConversationList(state),
    }),
    [state, store],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
