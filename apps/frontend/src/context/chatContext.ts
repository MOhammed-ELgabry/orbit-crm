import { createContext } from "react";

import type { ChatConversation } from "../types/chat";
import type { ChatState } from "./chatState";
import type { ChatStore } from "./chatStore";

export interface ChatContextValue {
  /** Full state (threads, presence, connection...). */
  state: ChatState;
  /** Sum of unread counters across all conversations (header badge). */
  totalUnread: number;
  /** Team chat first, then by latest activity. */
  conversations: ChatConversation[];
  /** Actions: send, load, retry, open a direct chat, report viewport... */
  store: ChatStore;
}

export const ChatContext = createContext<ChatContextValue | null>(null);
