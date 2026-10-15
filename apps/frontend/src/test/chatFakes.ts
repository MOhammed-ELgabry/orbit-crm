import { vi, type Mock } from "vitest";

import type { ChatApi } from "../context/chatStore";
import type { WebSocketLike } from "../services/chatSocket";
import type {
  ChatBootstrap,
  ChatConversation,
  ChatMessage,
  ChatTeammate,
} from "../types/chat";

/** Controllable stand-in for the browser WebSocket. */
export class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];

  static reset(): void {
    FakeSocket.instances = [];
  }

  static last(): FakeSocket {
    const socket = FakeSocket.instances.at(-1);
    if (!socket) throw new Error("no socket was created");
    return socket;
  }

  readonly url: string;
  readyState = 0;
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onclose: WebSocketLike["onclose"] = null;
  onerror: WebSocketLike["onerror"] = null;
  sent: string[] = [];
  closedWith: number | undefined;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  // --- test controls ---
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(event: object | string): void {
    this.onmessage?.({
      data: typeof event === "string" ? event : JSON.stringify(event),
    });
  }

  ready(heartbeatMs = 20_000): void {
    this.open();
    this.receive({
      type: "ready",
      connectionId: "conn-1",
      serverTime: new Date().toISOString(),
      heartbeatMs,
      tokenExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
  }

  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

export const ME = {
  id: "u1",
  companyId: "co1",
  name: "Mona Hassan",
  avatar: null,
  roleName: "Manager",
};

export function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const sequence = overrides.sequence ?? 1;

  return {
    id: `msg-${overrides.conversationId ?? "c-team"}-${sequence}`,
    conversationId: "c-team",
    sequence,
    senderId: "u2",
    senderName: "Sara Ali",
    senderAvatar: null,
    senderRole: "Agent",
    clientMessageId: `client-${sequence}-xxxxxxxx`,
    body: `message ${sequence}`,
    createdAt: new Date(Date.UTC(2026, 9, 13, 9, sequence)).toISOString(),
    receipt: null,
    ...overrides,
  };
}

export function makeConversation(
  overrides: Partial<ChatConversation> = {},
): ChatConversation {
  return {
    id: "c-team",
    type: "TEAM",
    lastSequence: 0,
    unreadCount: 0,
    lastMessage: null,
    peer: null,
    peerReadSequence: null,
    readSequence: 0,
    canSend: true,
    updatedAt: new Date(Date.UTC(2026, 9, 13, 8, 0)).toISOString(),
    ...overrides,
  };
}

export function makeDirect(
  overrides: Partial<ChatConversation> = {},
): ChatConversation {
  return makeConversation({
    id: "c-direct",
    type: "DIRECT",
    peer: {
      id: "u2",
      name: "Sara Ali",
      avatar: null,
      roleName: "Agent",
      eligible: true,
      online: false,
      lastSeenAt: null,
    },
    peerReadSequence: 0,
    ...overrides,
  });
}

export const TEAMMATES: ChatTeammate[] = [
  {
    id: "u2",
    name: "Sara Ali",
    avatar: null,
    roleName: "Agent",
    online: true,
    lastSeenAt: null,
  },
  {
    id: "u3",
    name: "Omar Said",
    avatar: null,
    roleName: null,
    online: false,
    lastSeenAt: null,
  },
];

export function makeBootstrap(
  overrides: Partial<ChatBootstrap> = {},
): ChatBootstrap {
  const conversations = overrides.conversations ?? [makeConversation()];

  return {
    me: ME,
    conversations,
    teammates: TEAMMATES,
    totalUnread: conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    serverTime: new Date().toISOString(),
    ...overrides,
  };
}

export function emptyPage(conversationId = "c-team") {
  return {
    messages: [] as ChatMessage[],
    hasMore: false,
    conversationId,
    lastSequence: 0,
    peerReadSequence: null,
    readSequence: 0,
  };
}

type MockedApi = { [K in keyof ChatApi]: Mock<ChatApi[K]> };

/** A fully mocked REST boundary with sensible defaults. */
export function makeApi(overrides: Partial<MockedApi> = {}): MockedApi {
  const api: MockedApi = {
    getChatSession: vi.fn<ChatApi["getChatSession"]>().mockResolvedValue({
      me: ME,
      serverTime: new Date().toISOString(),
    }),
    getChatBootstrap: vi
      .fn<ChatApi["getChatBootstrap"]>()
      .mockResolvedValue(makeBootstrap()),
    listChatConversations: vi
      .fn<ChatApi["listChatConversations"]>()
      .mockResolvedValue([makeConversation()]),
    openDirectConversation: vi
      .fn<ChatApi["openDirectConversation"]>()
      .mockResolvedValue(makeDirect()),
    getChatMessages: vi
      .fn<ChatApi["getChatMessages"]>()
      .mockResolvedValue(emptyPage()),
    getChatReceipts: vi.fn<ChatApi["getChatReceipts"]>().mockResolvedValue([]),
    sendChatMessage: vi.fn<ChatApi["sendChatMessage"]>(),
    markChatRead: vi
      .fn<ChatApi["markChatRead"]>()
      .mockImplementation((conversationId, upTo) =>
        Promise.resolve({
          conversationId,
          readSequence: upTo,
          unreadCount: 0,
        }),
      ),
    ...overrides,
  };

  return api;
}
