import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({
  API_BASE_URL: "http://api.example.test:3000",
  default: {},
}));

import { ChatStore, READ_DEBOUNCE_MS, normalizeChatBody } from "./chatStore";
import type { ChatConversation, ChatSendResult } from "../types/chat";
import {
  FakeSocket,
  ME,
  emptyPage,
  makeApi,
  makeBootstrap,
  makeConversation,
  makeDirect,
  makeMessage,
} from "../test/chatFakes";

function httpError(status: number): AxiosError {
  return new AxiosError("failed", String(status), undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: {},
  });
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("normalizeChatBody", () => {
  it("mirrors the server: CRLF -> LF, control characters removed, trimmed", () => {
    expect(normalizeChatBody("  hi\r\nthere\u0000\u0007 ")).toBe("hi\nthere");
    expect(normalizeChatBody("\t\n ")).toBe("");
  });
});

describe("ChatStore", () => {
  let api: ReturnType<typeof makeApi>;
  let store: ChatStore;
  let ids: number;

  const connect = async () => {
    store.start();
    await flush();
    FakeSocket.last().ready();
    await flush();
    return FakeSocket.last();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.reset();
    ids = 0;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    api = makeApi();
    store = new ChatStore({
      api,
      createSocket: (url) => new FakeSocket(url),
      socketUrl: "ws://test/chat/ws",
      newClientMessageId: () => `client-id-${(ids += 1)}-xxxxxxxx`,
    });
  });

  afterEach(() => {
    store.stop();
    vi.useRealTimers();
  });

  it("bootstraps the conversations and goes live", async () => {
    await connect();

    const state = store.getSnapshot();
    expect(state.phase).toBe("ready");
    expect(state.me?.id).toBe("u1");
    expect(state.connection).toBe("online");
    expect(Object.keys(state.conversations)).toEqual(["c-team"]);
  });

  it("becomes unavailable (and stops trying) when the server answers 403", async () => {
    api.getChatBootstrap.mockRejectedValue(httpError(403));
    api.getChatSession.mockRejectedValue(httpError(403));

    store.start();
    await flush();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(store.getSnapshot().phase).toBe("unavailable");
    expect(FakeSocket.instances).toHaveLength(0);
    expect(api.getChatSession).toHaveBeenCalledTimes(1);
  });

  it("shows an error phase on a transient bootstrap failure and can retry", async () => {
    api.getChatBootstrap.mockRejectedValueOnce(httpError(500));
    store.start();
    await flush();
    expect(store.getSnapshot().phase).toBe("error");

    store.retryBootstrap();
    await flush();
    expect(store.getSnapshot().phase).toBe("ready");
  });

  describe("subscribeActivity (notification counter hook)", () => {
    it("reports `incoming` for a message from someone else, never for mine", async () => {
      const socket = await connect();
      const kinds: string[] = [];
      store.subscribeActivity((kind) => kinds.push(kind));

      socket.receive({
        type: "message.new",
        conversationId: "c-team",
        conversationType: "TEAM",
        message: makeMessage({ sequence: 1, senderId: ME.id }),
      });
      expect(kinds).toEqual([]);

      socket.receive({
        type: "message.new",
        conversationId: "c-team",
        conversationType: "TEAM",
        message: makeMessage({ sequence: 2, senderId: "u2" }),
      });
      expect(kinds).toEqual(["incoming"]);
    });

    it("reports `read` after a successful acknowledgement, not after a failed one", async () => {
      await connect();
      api.getChatMessages.mockResolvedValue({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 1 })],
        lastSequence: 1,
      });
      await store.loadThread("c-team");
      const kinds: string[] = [];
      store.subscribeActivity((kind) => kinds.push(kind));

      api.markChatRead.mockRejectedValueOnce(httpError(500));
      store.reportViewport("c-team", true);
      await vi.advanceTimersByTimeAsync(READ_DEBOUNCE_MS);
      expect(kinds).toEqual([]);

      store.reportViewport("c-team", false);
      store.reportViewport("c-team", true);
      await vi.advanceTimersByTimeAsync(READ_DEBOUNCE_MS);
      expect(kinds).toEqual(["read"]);
    });

    it("reports `read` when another tab/device read the conversation", async () => {
      const socket = await connect();
      const kinds: string[] = [];
      store.subscribeActivity((kind) => kinds.push(kind));

      socket.receive({
        type: "read.updated",
        conversationId: "c-team",
        conversationType: "TEAM",
        readerId: ME.id,
        upToSequence: 4,
      });

      expect(kinds).toEqual(["read"]);
    });

    it("stops notifying after unsubscribe and survives a throwing listener", async () => {
      const socket = await connect();
      const seen = vi.fn();
      store.subscribeActivity(() => {
        throw new Error("boom");
      });
      const off = store.subscribeActivity(seen);

      const send = (sequence: number) =>
        socket.receive({
          type: "message.new",
          conversationId: "c-team",
          conversationType: "TEAM",
          message: makeMessage({ sequence, senderId: "u2" }),
        });

      send(1);
      expect(seen).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().conversations["c-team"].unreadCount).toBe(1);

      off();
      send(2);
      expect(seen).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().conversations["c-team"].unreadCount).toBe(2);
    });
  });

  describe("incoming messages", () => {
    it("counts a message as unread when the thread is not being viewed", async () => {
      const socket = await connect();

      socket.receive({
        type: "message.new",
        conversationId: "c-team",
        conversationType: "TEAM",
        message: makeMessage({ sequence: 1 }),
      });

      expect(store.getSnapshot().conversations["c-team"].unreadCount).toBe(1);
    });

    it("does not count it, and acknowledges it, when the user is looking at the latest", async () => {
      const socket = await connect();
      api.getChatMessages.mockResolvedValue({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 1 })],
        lastSequence: 1,
      });
      await store.loadThread("c-team");
      store.reportViewport("c-team", true);
      await vi.advanceTimersByTimeAsync(READ_DEBOUNCE_MS);
      api.markChatRead.mockClear();

      socket.receive({
        type: "message.new",
        conversationId: "c-team",
        conversationType: "TEAM",
        message: makeMessage({ sequence: 2 }),
      });
      await vi.advanceTimersByTimeAsync(READ_DEBOUNCE_MS);

      expect(store.getSnapshot().conversations["c-team"].unreadCount).toBe(0);
      expect(api.markChatRead).toHaveBeenCalledTimes(1);
      expect(api.markChatRead).toHaveBeenCalledWith("c-team", 2);
    });

    it("counts it and does NOT acknowledge it while scrolled away from the latest", async () => {
      const socket = await connect();
      api.getChatMessages.mockResolvedValue({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 1 })],
        lastSequence: 1,
      });
      await store.loadThread("c-team");
      store.reportViewport("c-team", false);
      await vi.advanceTimersByTimeAsync(READ_DEBOUNCE_MS);
      api.markChatRead.mockClear();

      socket.receive({
        type: "message.new",
        conversationId: "c-team",
        conversationType: "TEAM",
        message: makeMessage({ sequence: 2 }),
      });
      await vi.advanceTimersByTimeAsync(READ_DEBOUNCE_MS);

      expect(store.getSnapshot().conversations["c-team"].unreadCount).toBe(1);
      expect(api.markChatRead).not.toHaveBeenCalled();

      // ...until the user scrolls to the latest.
      store.reportViewport("c-team", true);
      await vi.advanceTimersByTimeAsync(READ_DEBOUNCE_MS);
      expect(api.markChatRead).toHaveBeenCalledWith("c-team", 2);
    });

    it("does not acknowledge anything while the tab is hidden", async () => {
      const socket = await connect();
      api.getChatMessages.mockResolvedValue({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 1 })],
        lastSequence: 1,
      });
      await store.loadThread("c-team");
      api.markChatRead.mockClear();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      store.reportViewport("c-team", true);
      socket.receive({
        type: "message.new",
        conversationId: "c-team",
        conversationType: "TEAM",
        message: makeMessage({ sequence: 2 }),
      });
      await vi.advanceTimersByTimeAsync(READ_DEBOUNCE_MS * 2);

      expect(api.markChatRead).not.toHaveBeenCalled();
      expect(store.getSnapshot().conversations["c-team"].unreadCount).toBe(1);
    });

    it("refreshes the conversation list when a message arrives for an unknown conversation", async () => {
      const socket = await connect();
      api.listChatConversations.mockResolvedValue([
        makeConversation(),
        makeDirect({ unreadCount: 1 }),
      ]);

      socket.receive({
        type: "message.new",
        conversationId: "c-direct",
        conversationType: "DIRECT",
        message: makeMessage({ conversationId: "c-direct", sequence: 1 }),
      });
      await vi.advanceTimersByTimeAsync(400);

      expect(api.listChatConversations).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().conversations["c-direct"]).toBeDefined();
    });

    it("applies presence updates", async () => {
      const socket = await connect();

      socket.receive({
        type: "presence.update",
        userId: "u2",
        online: false,
        lastSeenAt: "2026-10-13T09:00:00.000Z",
      });

      expect(store.getSnapshot().presence.u2.online).toBe(false);
    });
  });

  describe("sending", () => {
    beforeEach(async () => {
      await connect();
      api.getChatMessages.mockResolvedValue(emptyPage());
      await store.loadThread("c-team");
    });

    const persisted = (clientMessageId: string, sequence = 1) =>
      makeMessage({
        sequence,
        senderId: ME.id,
        senderName: ME.name,
        clientMessageId,
        body: "hello",
        receipt: { readCount: 0, recipientCount: 2 },
      });

    it("rejects empty, oversized and unavailable sends without calling the API", () => {
      expect(store.sendMessage("c-team", "   \n ")).toEqual({
        ok: false,
        reason: "empty",
      });
      expect(store.sendMessage("c-team", "x".repeat(4001))).toEqual({
        ok: false,
        reason: "too_long",
      });
      expect(store.sendMessage("nope", "hi")).toEqual({
        ok: false,
        reason: "unavailable",
      });
      expect(api.sendChatMessage).not.toHaveBeenCalled();
    });

    it("shows the message optimistically, then swaps it for the persisted one", async () => {
      let resolve: (value: ChatSendResult) => void = () => undefined;
      api.sendChatMessage.mockReturnValue(new Promise((r) => (resolve = r)));

      const outcome = store.sendMessage("c-team", "  hello ");
      expect(outcome).toEqual({
        ok: true,
        clientMessageId: "client-id-1-xxxxxxxx",
      });
      expect(store.getSnapshot().threads["c-team"].pending).toHaveLength(1);
      expect(api.sendChatMessage).toHaveBeenCalledWith(
        "c-team",
        "client-id-1-xxxxxxxx",
        "hello",
      );

      resolve({ message: persisted("client-id-1-xxxxxxxx"), duplicate: false });
      await flush();

      const thread = store.getSnapshot().threads["c-team"];
      expect(thread.pending).toHaveLength(0);
      expect(thread.messages).toHaveLength(1);
    });

    it("does not duplicate the message when the socket echo arrives before the REST response", async () => {
      let resolve: (value: ChatSendResult) => void = () => undefined;
      api.sendChatMessage.mockReturnValue(new Promise((r) => (resolve = r)));
      const socket = FakeSocket.last();

      store.sendMessage("c-team", "hello");
      const message = persisted("client-id-1-xxxxxxxx");

      socket.receive({
        type: "message.new",
        conversationId: "c-team",
        conversationType: "TEAM",
        message,
      });
      resolve({ message, duplicate: false });
      await flush();

      const state = store.getSnapshot();
      expect(state.threads["c-team"].messages).toHaveLength(1);
      expect(state.threads["c-team"].pending).toHaveLength(0);
      expect(state.conversations["c-team"].unreadCount).toBe(0);
    });

    it("keeps a failed send, retries with the SAME clientMessageId, and recovers", async () => {
      api.sendChatMessage.mockRejectedValueOnce(httpError(503));

      store.sendMessage("c-team", "hello");
      await flush();

      expect(store.getSnapshot().threads["c-team"].pending[0]).toMatchObject({
        status: "failed",
        retryable: true,
      });

      api.sendChatMessage.mockResolvedValueOnce({
        message: persisted("client-id-1-xxxxxxxx"),
        duplicate: true,
      });
      store.retryMessage("c-team", "client-id-1-xxxxxxxx");
      await flush();

      expect(api.sendChatMessage).toHaveBeenNthCalledWith(
        2,
        "c-team",
        "client-id-1-xxxxxxxx",
        "hello",
      );
      expect(store.getSnapshot().threads["c-team"].pending).toHaveLength(0);
      expect(store.getSnapshot().threads["c-team"].messages).toHaveLength(1);
    });

    it("never retries a send the server refused", async () => {
      api.sendChatMessage.mockRejectedValue(httpError(403));

      store.sendMessage("c-team", "hello");
      await flush();
      store.retryMessage("c-team", "client-id-1-xxxxxxxx");
      await flush();

      expect(api.sendChatMessage).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().threads["c-team"].pending[0]).toMatchObject({
        status: "failed",
        retryable: false,
      });
    });

    it("a double retry click sends only once", async () => {
      api.sendChatMessage.mockRejectedValueOnce(
        new AxiosError("Network Error"),
      );
      store.sendMessage("c-team", "hello");
      await flush();

      let resolve: (value: ChatSendResult) => void = () => undefined;
      api.sendChatMessage.mockReturnValue(new Promise((r) => (resolve = r)));
      store.retryMessage("c-team", "client-id-1-xxxxxxxx");
      store.retryMessage("c-team", "client-id-1-xxxxxxxx");

      expect(api.sendChatMessage).toHaveBeenCalledTimes(2);
      resolve({ message: persisted("client-id-1-xxxxxxxx"), duplicate: false });
      await flush();
    });

    it("can discard a failed message", async () => {
      api.sendChatMessage.mockRejectedValue(httpError(403));
      store.sendMessage("c-team", "hello");
      await flush();

      store.discardMessage("c-team", "client-id-1-xxxxxxxx");
      expect(store.getSnapshot().threads["c-team"].pending).toHaveLength(0);
    });
  });

  describe("read receipts", () => {
    it("direct: the peer reading marks own messages as seen without a request", async () => {
      api.getChatBootstrap.mockResolvedValue(
        makeBootstrap({ conversations: [makeConversation(), makeDirect()] }),
      );
      const socket = await connect();
      api.getChatMessages.mockResolvedValue({
        ...emptyPage("c-direct"),
        messages: [
          makeMessage({
            conversationId: "c-direct",
            sequence: 1,
            senderId: ME.id,
            receipt: { readCount: 0, recipientCount: 1 },
          }),
        ],
        lastSequence: 1,
      });
      await store.loadThread("c-direct");
      api.getChatReceipts.mockClear();

      socket.receive({
        type: "read.updated",
        conversationId: "c-direct",
        conversationType: "DIRECT",
        readerId: "u2",
        upToSequence: 1,
      });

      expect(
        store.getSnapshot().threads["c-direct"].messages[0].receipt,
      ).toEqual({ readCount: 1, recipientCount: 1 });
      expect(api.getChatReceipts).not.toHaveBeenCalled();
    });

    it("team: a member reading triggers one debounced receipts refresh", async () => {
      const socket = await connect();
      api.getChatMessages.mockResolvedValue({
        ...emptyPage(),
        messages: [
          makeMessage({
            sequence: 4,
            senderId: ME.id,
            receipt: { readCount: 0, recipientCount: 3 },
          }),
        ],
        lastSequence: 4,
      });
      await store.loadThread("c-team");
      api.getChatReceipts.mockResolvedValue([
        { id: "msg-c-team-4", sequence: 4, readCount: 2, recipientCount: 3 },
      ]);

      for (const readerId of ["u2", "u3"]) {
        socket.receive({
          type: "read.updated",
          conversationId: "c-team",
          conversationType: "TEAM",
          readerId,
          upToSequence: 4,
        });
      }
      await vi.advanceTimersByTimeAsync(600);

      expect(api.getChatReceipts).toHaveBeenCalledTimes(1);
      expect(api.getChatReceipts).toHaveBeenCalledWith("c-team", 4, 4);
      expect(store.getSnapshot().threads["c-team"].messages[0].receipt).toEqual(
        { readCount: 2, recipientCount: 3 },
      );
    });

    it("reading in another tab re-reads the unread counters", async () => {
      const socket = await connect();
      api.listChatConversations.mockClear();
      api.listChatConversations.mockResolvedValue([
        makeConversation({ readSequence: 9 }),
      ]);

      socket.receive({
        type: "read.updated",
        conversationId: "c-team",
        conversationType: "TEAM",
        readerId: ME.id,
        upToSequence: 9,
      });
      await vi.advanceTimersByTimeAsync(400);

      expect(api.listChatConversations).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().conversations["c-team"].readSequence).toBe(9);
    });

    it("an acknowledgement is requested once per new latest message, not repeatedly", async () => {
      await connect();
      api.getChatMessages.mockResolvedValue({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 3 })],
        lastSequence: 3,
      });
      await store.loadThread("c-team");
      store.reportViewport("c-team", true);
      store.reportViewport("c-team", false);
      store.reportViewport("c-team", true);
      await vi.advanceTimersByTimeAsync(READ_DEBOUNCE_MS * 4);

      expect(api.markChatRead).toHaveBeenCalledTimes(1);
      expect(api.markChatRead).toHaveBeenCalledWith("c-team", 3);
    });
  });

  describe("history", () => {
    it("loads older pages by sequence cursor and prepends them", async () => {
      await connect();
      api.getChatMessages.mockResolvedValueOnce({
        ...emptyPage(),
        messages: [
          makeMessage({ sequence: 31 }),
          makeMessage({ sequence: 32 }),
        ],
        hasMore: true,
        lastSequence: 32,
      });
      await store.loadThread("c-team");

      api.getChatMessages.mockResolvedValueOnce({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 30 })],
        hasMore: false,
      });
      await store.loadOlder("c-team");

      expect(api.getChatMessages).toHaveBeenLastCalledWith("c-team", {
        before: 31,
        limit: 30,
      });
      const thread = store.getSnapshot().threads["c-team"];
      expect(thread.messages.map((m) => m.sequence)).toEqual([30, 31, 32]);
      expect(thread.hasMore).toBe(false);
    });

    it("loading a thread twice fetches it once; an error can be retried", async () => {
      await connect();
      api.getChatMessages.mockRejectedValueOnce(httpError(500));
      await store.loadThread("c-team");
      expect(store.getSnapshot().threads["c-team"].status).toBe("error");

      await store.loadThread("c-team");
      await store.loadThread("c-team");
      expect(api.getChatMessages).toHaveBeenCalledTimes(2);
      expect(store.getSnapshot().threads["c-team"].status).toBe("ready");
    });
  });

  describe("reconnect recovery", () => {
    it("fetches what an open thread missed while offline (after the last sequence)", async () => {
      const socket = await connect();
      api.getChatMessages.mockResolvedValueOnce({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 1 }), makeMessage({ sequence: 2 })],
        lastSequence: 2,
      });
      await store.loadThread("c-team");

      socket.serverClose(1006);
      await vi.advanceTimersByTimeAsync(1_000);

      api.getChatMessages.mockResolvedValueOnce({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 3 })],
        lastSequence: 3,
      });
      FakeSocket.last().ready();
      await flush();

      expect(api.getChatMessages).toHaveBeenLastCalledWith("c-team", {
        after: 2,
        limit: 50,
      });
      expect(
        store.getSnapshot().threads["c-team"].messages.map((m) => m.sequence),
      ).toEqual([1, 2, 3]);
    });

    it("resends a message that failed while offline (idempotent) after reconnecting", async () => {
      const socket = await connect();
      await store.loadThread("c-team");
      api.sendChatMessage.mockRejectedValueOnce(
        new AxiosError("Network Error"),
      );
      store.sendMessage("c-team", "offline hello");
      await flush();
      expect(store.getSnapshot().threads["c-team"].pending[0].status).toBe(
        "failed",
      );

      api.sendChatMessage.mockResolvedValue({
        message: makeMessage({
          sequence: 1,
          senderId: ME.id,
          clientMessageId: "client-id-1-xxxxxxxx",
        }),
        duplicate: false,
      });
      socket.serverClose(1006);
      await vi.advanceTimersByTimeAsync(1_000);
      FakeSocket.last().ready();
      await flush();

      expect(api.sendChatMessage).toHaveBeenCalledTimes(2);
      expect(api.sendChatMessage).toHaveBeenLastCalledWith(
        "c-team",
        "client-id-1-xxxxxxxx",
        "offline hello",
      );
      expect(store.getSnapshot().threads["c-team"].pending).toHaveLength(0);
    });

    it("falls back to a fresh first page when too far behind", async () => {
      const socket = await connect();
      api.getChatMessages.mockResolvedValueOnce({
        ...emptyPage(),
        messages: [makeMessage({ sequence: 1 })],
        lastSequence: 1,
      });
      await store.loadThread("c-team");
      socket.serverClose(1006);
      await vi.advanceTimersByTimeAsync(1_000);

      api.getChatMessages.mockImplementation((_id, query) =>
        Promise.resolve(
          query?.after !== undefined
            ? {
                ...emptyPage(),
                messages: [makeMessage({ sequence: 2 })],
                hasMore: true,
              }
            : {
                ...emptyPage(),
                messages: [makeMessage({ sequence: 400 })],
                lastSequence: 400,
              },
        ),
      );
      FakeSocket.last().ready();
      await vi.advanceTimersByTimeAsync(50);

      const sequences = store
        .getSnapshot()
        .threads["c-team"].messages.map((m) => m.sequence);
      expect(sequences).toContain(400);
    });
  });

  describe("opening a direct chat", () => {
    it("stores the conversation the server resolved for the pair", async () => {
      await connect();

      const conversation = await store.openDirect("u2");

      expect(api.openDirectConversation).toHaveBeenCalledWith("u2");
      expect(conversation.id).toBe("c-direct");
      expect(store.getSnapshot().conversations["c-direct"]).toBeDefined();
    });
  });

  describe("cleanup", () => {
    it("stop() releases the socket, timers and listeners and silences late responses", async () => {
      const socket = await connect();
      let resolve: (value: ChatConversation[]) => void = () => undefined;
      api.listChatConversations.mockReturnValue(
        new Promise((r) => (resolve = r)),
      );
      socket.receive({
        type: "message.new",
        conversationId: "c-other",
        conversationType: "DIRECT",
        message: makeMessage({ conversationId: "c-other" }),
      });
      await vi.advanceTimersByTimeAsync(400);

      const before = store.getSnapshot();
      store.stop();
      resolve([makeConversation({ id: "c-leak" })]);
      await flush();

      expect(socket.closedWith).toBe(1000);
      expect(vi.getTimerCount()).toBe(0);
      expect(store.getSnapshot().conversations).toBe(before.conversations);

      const sessions = api.getChatSession.mock.calls.length;
      await vi.advanceTimersByTimeAsync(120_000);
      expect(api.getChatSession).toHaveBeenCalledTimes(sessions);
    });

    it("can be started again after a stop (React StrictMode)", async () => {
      store.start();
      store.stop();
      store.start();
      await flush();
      FakeSocket.last().ready();
      await flush();

      expect(store.getSnapshot().connection).toBe("online");
      expect(
        FakeSocket.instances.filter((s) => s.closedWith === undefined),
      ).toHaveLength(1);
    });

    it("notifies subscribers only when the state really changes", async () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      await connect();
      const calls = listener.mock.calls.length;
      expect(calls).toBeGreaterThan(0);

      store.reportViewport(null, true);
      expect(listener).toHaveBeenCalledTimes(calls);

      unsubscribe();
    });
  });
});
