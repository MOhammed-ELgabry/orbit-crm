import { createContext } from "react";

import type { AppNotification } from "../types/notification";

export interface NotificationsContextValue {
  unreadCount: number;
  items: AppNotification[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasError: boolean;
  /** Fetches the first page (panel opened / page mounted). */
  loadList: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Re-reads the unread counter right now (outside the 60s poll). */
  refreshUnreadCount: () => Promise<void>;
}

export const NotificationsContext =
  createContext<NotificationsContextValue | null>(null);