/**
 * Wire types of the Team Chat API (backend `modules/chat`). Everything here
 * is what the SERVER decided: the client never sends a sender, company or
 * audience — only a conversation id, a body and a retry-safe client id.
 */

export type ChatConversationType = "TEAM" | "DIRECT";

export interface ChatReceipt {
  readCount: number;
  recipientCount: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  /** Per-conversation, strictly increasing. The ordering key. */
  sequence: number;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  senderRole: string | null;
  clientMessageId: string;
  body: string;
  createdAt: string;
  /** Only present on the caller's own messages. */
  receipt: ChatReceipt | null;
}

export interface ChatPresence {
  online: boolean;
  lastSeenAt: string | null;
}

export interface ChatPeer extends ChatPresence {
  id: string;
  name: string;
  avatar: string | null;
  roleName: string | null;
  eligible: boolean;
}

export interface ChatConversation {
  id: string;
  type: ChatConversationType;
  lastSequence: number;
  unreadCount: number;
  lastMessage: ChatMessage | null;
  peer: ChatPeer | null;
  peerReadSequence: number | null;
  readSequence: number;
  canSend: boolean;
  updatedAt: string;
}

export interface ChatTeammate extends ChatPresence {
  id: string;
  name: string;
  avatar: string | null;
  roleName: string | null;
}

export interface ChatMe {
  id: string;
  companyId: string;
  name: string;
  avatar: string | null;
  roleName: string | null;
}

export interface ChatBootstrap {
  me: ChatMe;
  conversations: ChatConversation[];
  teammates: ChatTeammate[];
  totalUnread: number;
  serverTime: string;
}

export interface ChatMessagesPage {
  messages: ChatMessage[];
  hasMore: boolean;
  conversationId: string;
  lastSequence: number;
  peerReadSequence: number | null;
  readSequence: number;
}

export interface ChatReceiptRow {
  id: string;
  sequence: number;
  readCount: number;
  recipientCount: number;
}

export interface ChatSendResult {
  message: ChatMessage;
  duplicate: boolean;
}

export interface ChatReadResult {
  conversationId: string;
  readSequence: number;
  unreadCount: number;
}

export interface ChatMessagesQuery {
  before?: number;
  after?: number;
  limit?: number;
}

// --- Real-time (server -> client) -------------------------------------

export type ChatServerEvent =
  | {
      type: "ready";
      connectionId: string;
      serverTime: string;
      heartbeatMs: number;
      tokenExpiresAt: string;
    }
  | { type: "pong"; serverTime: string }
  | {
      type: "message.new";
      conversationId: string;
      conversationType: ChatConversationType;
      message: ChatMessage;
    }
  | {
      type: "read.updated";
      conversationId: string;
      conversationType: ChatConversationType;
      readerId: string;
      upToSequence: number;
    }
  | {
      type: "presence.update";
      userId: string;
      online: boolean;
      lastSeenAt: string | null;
    }
  | { type: "error"; code: string };

/** Limits mirrored from the backend (`chat.constants.ts`). */
export const CHAT_MESSAGE_MAX_LENGTH = 4000;
export const CHAT_HISTORY_PAGE_SIZE = 30;
