import type { ChatSocketStatus } from "../services/chatSocket";
import type {
  ChatBootstrap,
  ChatConversation,
  ChatMe,
  ChatMessage,
  ChatPresence,
  ChatReceiptRow,
  ChatTeammate,
} from "../types/chat";

/**
 * Pure state of Team Chat. Everything that changes it goes through
 * `chatReducer`, which keeps the interesting rules (ordering by sequence,
 * de-duplication between the REST response and the real-time echo, read
 * cursors that only move forward) testable without React or a network.
 */

export interface PendingMessage {
  clientMessageId: string;
  conversationId: string;
  body: string;
  createdAt: string;
  status: "sending" | "failed";
  /** Re-sending the same clientMessageId may succeed (network, 5xx, 429). */
  retryable: boolean;
}

export interface ThreadState {
  /** Ascending by `sequence`, unique by `id`. */
  messages: ChatMessage[];
  pending: PendingMessage[];
  /** There are older messages on the server. */
  hasMore: boolean;
  status: "idle" | "loading" | "ready" | "error";
  loadingOlder: boolean;
}

export type ChatPhase = "idle" | "loading" | "ready" | "error" | "unavailable";

export interface ChatState {
  phase: ChatPhase;
  connection: ChatSocketStatus | "idle";
  me: ChatMe | null;
  conversations: Record<string, ChatConversation>;
  teammates: ChatTeammate[];
  presence: Record<string, ChatPresence>;
  threads: Record<string, ThreadState>;
}

export const EMPTY_THREAD: ThreadState = {
  messages: [],
  pending: [],
  hasMore: false,
  status: "idle",
  loadingOlder: false,
};

export const initialChatState: ChatState = {
  phase: "idle",
  connection: "idle",
  me: null,
  conversations: {},
  teammates: [],
  presence: {},
  threads: {},
};

export type ChatAction =
  | { type: "phase"; phase: ChatPhase }
  | { type: "connection"; connection: ChatSocketStatus }
  | { type: "bootstrap"; data: ChatBootstrap }
  | { type: "conversations"; conversations: ChatConversation[] }
  | { type: "conversation.upsert"; conversation: ChatConversation }
  | { type: "presence"; userId: string; presence: ChatPresence }
  | {
      type: "message.received";
      message: ChatMessage;
      /** The caller is not looking at it right now: bump the unread count. */
      countAsUnread: boolean;
    }
  | { type: "thread.loading"; conversationId: string }
  | { type: "thread.error"; conversationId: string }
  | {
      type: "thread.loaded";
      conversationId: string;
      messages: ChatMessage[];
      hasMore: boolean;
      lastSequence: number;
      readSequence: number;
      peerReadSequence: number | null;
    }
  | { type: "thread.older.loading"; conversationId: string }
  | {
      type: "thread.older.loaded";
      conversationId: string;
      messages: ChatMessage[];
      hasMore: boolean;
    }
  | { type: "thread.older.failed"; conversationId: string }
  | {
      type: "thread.recovered";
      conversationId: string;
      messages: ChatMessage[];
    }
  | { type: "pending.add"; pending: PendingMessage }
  | {
      type: "pending.update";
      conversationId: string;
      clientMessageId: string;
      patch: Partial<Pick<PendingMessage, "status" | "retryable">>;
    }
  | {
      type: "pending.remove";
      conversationId: string;
      clientMessageId: string;
    }
  | {
      type: "read.mine";
      conversationId: string;
      readSequence: number;
      unreadCount?: number;
    }
  | { type: "read.peer"; conversationId: string; upToSequence: number }
  | {
      type: "receipts";
      conversationId: string;
      receipts: ChatReceiptRow[];
    };

// --- helpers --------------------------------------------------------------

function mergeReceipt(
  current: ChatMessage["receipt"],
  incoming: ChatMessage["receipt"],
): ChatMessage["receipt"] {
  if (!incoming) return current;
  if (!current) return incoming;

  // A read acknowledgement is never un-done: a stale response must not
  // lower what a live event already raised.
  return {
    recipientCount: incoming.recipientCount,
    readCount: Math.min(
      Math.max(current.readCount, incoming.readCount),
      incoming.recipientCount,
    ),
  };
}

/** Union by id, ascending by sequence; the newer copy wins field-wise. */
export function mergeMessages(
  existing: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();

  for (const message of existing) byId.set(message.id, message);

  for (const message of incoming) {
    const previous = byId.get(message.id);

    byId.set(
      message.id,
      previous
        ? {
            ...message,
            receipt: mergeReceipt(previous.receipt, message.receipt),
          }
        : message,
    );
  }

  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}

function threadOf(state: ChatState, conversationId: string): ThreadState {
  return state.threads[conversationId] ?? EMPTY_THREAD;
}

function withThread(
  state: ChatState,
  conversationId: string,
  update: (thread: ThreadState) => ThreadState,
): ChatState {
  return {
    ...state,
    threads: {
      ...state.threads,
      [conversationId]: update(threadOf(state, conversationId)),
    },
  };
}

function withConversation(
  state: ChatState,
  conversationId: string,
  update: (conversation: ChatConversation) => ChatConversation,
): ChatState {
  const current = state.conversations[conversationId];
  if (!current) return state;

  return {
    ...state,
    conversations: {
      ...state.conversations,
      [conversationId]: update(current),
    },
  };
}

function presenceFrom(
  teammates: readonly ChatTeammate[],
  conversations: readonly ChatConversation[],
  base: Record<string, ChatPresence>,
): Record<string, ChatPresence> {
  const next = { ...base };

  for (const teammate of teammates) {
    next[teammate.id] = {
      online: teammate.online,
      lastSeenAt: teammate.lastSeenAt,
    };
  }

  for (const conversation of conversations) {
    if (conversation.peer) {
      next[conversation.peer.id] = {
        online: conversation.peer.online,
        lastSeenAt: conversation.peer.lastSeenAt,
      };
    }
  }

  return next;
}

function toMap(
  conversations: readonly ChatConversation[],
): Record<string, ChatConversation> {
  return Object.fromEntries(conversations.map((c) => [c.id, c]));
}

// --- reducer --------------------------------------------------------------

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "phase":
      return state.phase === action.phase
        ? state
        : { ...state, phase: action.phase };

    case "connection":
      return state.connection === action.connection
        ? state
        : { ...state, connection: action.connection };

    case "bootstrap":
      return {
        ...state,
        phase: "ready",
        me: action.data.me,
        conversations: toMap(action.data.conversations),
        teammates: action.data.teammates,
        presence: presenceFrom(
          action.data.teammates,
          action.data.conversations,
          state.presence,
        ),
      };

    case "conversations":
      return {
        ...state,
        conversations: toMap(action.conversations),
        presence: presenceFrom([], action.conversations, state.presence),
      };

    case "conversation.upsert":
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.conversation.id]: action.conversation,
        },
        presence: presenceFrom([], [action.conversation], state.presence),
      };

    case "presence":
      return {
        ...state,
        presence: { ...state.presence, [action.userId]: action.presence },
      };

    case "message.received": {
      // The server builds one DTO per send and fans it out, so a recipient's
      // copy can carry the SENDER's receipt. Receipts are meaningful (and
      // shown) for the caller's own messages only.
      const message =
        state.me && action.message.senderId !== state.me.id
          ? { ...action.message, receipt: null }
          : action.message;
      const conversationId = message.conversationId;
      let next = state;
      // The same message can reach us twice (REST response + socket echo,
      // recovery after a reconnect): it must not be counted twice.
      const alreadyKnown = state.threads[conversationId]?.messages.some(
        (m) => m.id === message.id,
      );

      // Thread: insert in order and retire the optimistic copy (the REST
      // response and the socket echo race; whichever arrives first wins and
      // the other is a harmless no-op).
      if (state.threads[conversationId]) {
        next = withThread(next, conversationId, (thread) => ({
          ...thread,
          messages: mergeMessages(thread.messages, [message]),
          pending: thread.pending.filter(
            (p) => p.clientMessageId !== message.clientMessageId,
          ),
        }));
      }

      return withConversation(next, conversationId, (conversation) => {
        const isNewest = message.sequence >= conversation.lastSequence;
        const alreadyCounted = message.sequence <= conversation.readSequence;

        return {
          ...conversation,
          lastSequence: Math.max(conversation.lastSequence, message.sequence),
          lastMessage:
            !conversation.lastMessage ||
            message.sequence >= conversation.lastMessage.sequence
              ? message
              : conversation.lastMessage,
          updatedAt: isNewest ? message.createdAt : conversation.updatedAt,
          unreadCount:
            action.countAsUnread && !alreadyCounted && !alreadyKnown
              ? conversation.unreadCount + 1
              : conversation.unreadCount,
        };
      });
    }

    case "thread.loading":
      return withThread(state, action.conversationId, (thread) => ({
        ...thread,
        status: thread.status === "ready" ? "ready" : "loading",
      }));

    case "thread.error":
      return withThread(state, action.conversationId, (thread) => ({
        ...thread,
        status: thread.status === "ready" ? "ready" : "error",
      }));

    case "thread.loaded": {
      const next = withThread(state, action.conversationId, (thread) => {
        const newest = action.messages.at(-1)?.sequence ?? 0;
        // Live messages that arrived while this page was in flight and are
        // newer than anything in it must survive.
        const newer = thread.messages.filter((m) => m.sequence > newest);

        return {
          ...thread,
          messages: mergeMessages(action.messages, newer),
          hasMore: action.hasMore,
          status: "ready",
          loadingOlder: false,
        };
      });

      return withConversation(next, action.conversationId, (conversation) => ({
        ...conversation,
        lastSequence: Math.max(conversation.lastSequence, action.lastSequence),
        readSequence: Math.max(conversation.readSequence, action.readSequence),
        peerReadSequence:
          action.peerReadSequence === null
            ? conversation.peerReadSequence
            : Math.max(
                conversation.peerReadSequence ?? 0,
                action.peerReadSequence,
              ),
      }));
    }

    case "thread.older.loading":
      return withThread(state, action.conversationId, (thread) => ({
        ...thread,
        loadingOlder: true,
      }));

    case "thread.older.loaded":
      return withThread(state, action.conversationId, (thread) => ({
        ...thread,
        messages: mergeMessages(thread.messages, action.messages),
        hasMore: action.hasMore,
        loadingOlder: false,
      }));

    case "thread.older.failed":
      return withThread(state, action.conversationId, (thread) => ({
        ...thread,
        loadingOlder: false,
      }));

    case "thread.recovered":
      return withThread(state, action.conversationId, (thread) => ({
        ...thread,
        messages: mergeMessages(thread.messages, action.messages),
        pending: thread.pending.filter(
          (p) =>
            !action.messages.some(
              (m) => m.clientMessageId === p.clientMessageId,
            ),
        ),
      }));

    case "pending.add":
      return withThread(state, action.pending.conversationId, (thread) => ({
        ...thread,
        pending: [
          ...thread.pending.filter(
            (p) => p.clientMessageId !== action.pending.clientMessageId,
          ),
          action.pending,
        ],
      }));

    case "pending.update":
      return withThread(state, action.conversationId, (thread) => ({
        ...thread,
        pending: thread.pending.map((p) =>
          p.clientMessageId === action.clientMessageId
            ? { ...p, ...action.patch }
            : p,
        ),
      }));

    case "pending.remove":
      return withThread(state, action.conversationId, (thread) => ({
        ...thread,
        pending: thread.pending.filter(
          (p) => p.clientMessageId !== action.clientMessageId,
        ),
      }));

    case "read.mine":
      return withConversation(state, action.conversationId, (conversation) => ({
        ...conversation,
        readSequence: Math.max(conversation.readSequence, action.readSequence),
        unreadCount: action.unreadCount ?? conversation.unreadCount,
      }));

    case "read.peer": {
      const next = withConversation(
        state,
        action.conversationId,
        (conversation) => ({
          ...conversation,
          peerReadSequence: Math.max(
            conversation.peerReadSequence ?? 0,
            action.upToSequence,
          ),
        }),
      );

      const conversation = next.conversations[action.conversationId];
      if (!conversation || conversation.type !== "DIRECT") return next;
      if (!next.threads[action.conversationId]) return next;

      // A direct chat has exactly one recipient: reading up to N
      // acknowledges every own message with sequence <= N.
      return withThread(next, action.conversationId, (thread) => ({
        ...thread,
        messages: thread.messages.map((m) =>
          m.receipt && m.sequence <= action.upToSequence
            ? { ...m, receipt: { recipientCount: 1, readCount: 1 } }
            : m,
        ),
      }));
    }

    case "receipts": {
      const byId = new Map(action.receipts.map((r) => [r.id, r]));

      return withThread(state, action.conversationId, (thread) => ({
        ...thread,
        messages: thread.messages.map((m) => {
          const row = byId.get(m.id);
          if (!row || !m.receipt) return m;

          return {
            ...m,
            receipt: mergeReceipt(m.receipt, {
              readCount: row.readCount,
              recipientCount: row.recipientCount,
            }),
          };
        }),
      }));
    }

    default:
      return state;
  }
}

// --- selectors ------------------------------------------------------------

export function selectTotalUnread(state: ChatState): number {
  return Object.values(state.conversations).reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0,
  );
}

/** Team chat first, then by most recent activity. */
export function selectConversationList(state: ChatState): ChatConversation[] {
  return Object.values(state.conversations).sort((a, b) => {
    if (a.type !== b.type) return a.type === "TEAM" ? -1 : 1;

    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export function selectPresence(
  state: ChatState,
  userId: string,
  fallback?: ChatPresence,
): ChatPresence {
  return (
    state.presence[userId] ?? fallback ?? { online: false, lastSeenAt: null }
  );
}

export type ReceiptState = "sent" | "delivered" | "read";

/**
 * One check = the server persisted the message. Two checks = at least one
 * recipient acknowledged seeing it; "read" (all recipients) is the same two
 * checks, emphasised.
 */
export function receiptStateOf(message: ChatMessage): ReceiptState {
  const receipt = message.receipt;

  if (!receipt || receipt.readCount <= 0) return "sent";
  if (
    receipt.recipientCount > 0 &&
    receipt.readCount >= receipt.recipientCount
  ) {
    return "read";
  }

  return "delivered";
}
