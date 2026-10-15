import { describe, expect, it } from "vitest";

import {
  chatReducer,
  initialChatState,
  receiptStateOf,
  selectConversationList,
  selectTotalUnread,
  type ChatState,
  type PendingMessage,
} from "./chatState";
import {
  makeBootstrap,
  makeConversation,
  makeDirect,
  makeMessage,
} from "../test/chatFakes";

function loaded(conversationId = "c-team"): ChatState {
  let state = chatReducer(initialChatState, {
    type: "bootstrap",
    data: makeBootstrap({
      conversations: [makeConversation(), makeDirect()],
    }),
  });

  state = chatReducer(state, {
    type: "thread.loaded",
    conversationId,
    messages: [],
    hasMore: false,
    lastSequence: 0,
    readSequence: 0,
    peerReadSequence: null,
  });

  return state;
}

const pending = (over: Partial<PendingMessage> = {}): PendingMessage => ({
  clientMessageId: "client-1-xxxxxxxx",
  conversationId: "c-team",
  body: "hello",
  createdAt: new Date().toISOString(),
  status: "sending",
  retryable: true,
  ...over,
});

describe("chatReducer: messages", () => {
  it("keeps messages ordered by sequence even when they arrive out of order", () => {
    let state = loaded();

    for (const sequence of [3, 1, 2]) {
      state = chatReducer(state, {
        type: "message.received",
        message: makeMessage({ sequence }),
        countAsUnread: false,
      });
    }

    expect(state.threads["c-team"].messages.map((m) => m.sequence)).toEqual([
      1, 2, 3,
    ]);
  });

  it("never duplicates a message delivered twice and does not count it twice", () => {
    let state = loaded();
    const message = makeMessage({ sequence: 1 });

    for (let i = 0; i < 2; i += 1) {
      state = chatReducer(state, {
        type: "message.received",
        message,
        countAsUnread: true,
      });
    }

    expect(state.threads["c-team"].messages).toHaveLength(1);
    expect(state.conversations["c-team"].unreadCount).toBe(1);
  });

  it("replaces the optimistic copy with the persisted message (same clientMessageId)", () => {
    let state = loaded();

    state = chatReducer(state, { type: "pending.add", pending: pending() });
    expect(state.threads["c-team"].pending).toHaveLength(1);

    state = chatReducer(state, {
      type: "message.received",
      message: makeMessage({
        sequence: 1,
        senderId: "u1",
        clientMessageId: "client-1-xxxxxxxx",
        receipt: { readCount: 0, recipientCount: 3 },
      }),
      countAsUnread: false,
    });

    expect(state.threads["c-team"].pending).toHaveLength(0);
    expect(state.threads["c-team"].messages).toHaveLength(1);
    expect(state.conversations["c-team"].unreadCount).toBe(0);
  });

  it("does not count a message the reader has already acknowledged", () => {
    let state = loaded();
    state = chatReducer(state, {
      type: "read.mine",
      conversationId: "c-team",
      readSequence: 5,
    });

    state = chatReducer(state, {
      type: "message.received",
      message: makeMessage({ sequence: 4 }),
      countAsUnread: true,
    });

    expect(state.conversations["c-team"].unreadCount).toBe(0);
  });

  it("only moves the last-message preview forward", () => {
    let state = loaded();

    state = chatReducer(state, {
      type: "message.received",
      message: makeMessage({ sequence: 5 }),
      countAsUnread: false,
    });
    state = chatReducer(state, {
      type: "message.received",
      message: makeMessage({ sequence: 4 }),
      countAsUnread: false,
    });

    expect(state.conversations["c-team"].lastMessage?.sequence).toBe(5);
    expect(state.conversations["c-team"].lastSequence).toBe(5);
  });

  it("keeps live messages that arrived while a history page was loading", () => {
    let state = loaded();

    state = chatReducer(state, {
      type: "message.received",
      message: makeMessage({ sequence: 9 }),
      countAsUnread: false,
    });
    state = chatReducer(state, {
      type: "thread.loaded",
      conversationId: "c-team",
      messages: [makeMessage({ sequence: 7 }), makeMessage({ sequence: 8 })],
      hasMore: true,
      lastSequence: 8,
      readSequence: 0,
      peerReadSequence: null,
    });

    expect(state.threads["c-team"].messages.map((m) => m.sequence)).toEqual([
      7, 8, 9,
    ]);
  });

  it("drops the sender's receipt from a message somebody else wrote", () => {
    let state = loaded();

    state = chatReducer(state, {
      type: "message.received",
      message: makeMessage({
        sequence: 1,
        senderId: "u2",
        receipt: { readCount: 0, recipientCount: 3 },
      }),
      countAsUnread: true,
    });
    state = chatReducer(state, {
      type: "message.received",
      message: makeMessage({
        sequence: 2,
        senderId: "u1",
        receipt: { readCount: 0, recipientCount: 3 },
      }),
      countAsUnread: false,
    });

    const [theirs, mine] = state.threads["c-team"].messages;
    expect(theirs.receipt).toBeNull();
    expect(mine.receipt).toEqual({ readCount: 0, recipientCount: 3 });
  });

  it("ignores a live message for a conversation it does not know yet", () => {
    const state = chatReducer(initialChatState, {
      type: "message.received",
      message: makeMessage({ conversationId: "unknown" }),
      countAsUnread: true,
    });

    expect(state.conversations).toEqual({});
  });
});

describe("chatReducer: read state and receipts", () => {
  it("moves the read cursor forward only", () => {
    let state = loaded();

    state = chatReducer(state, {
      type: "read.mine",
      conversationId: "c-team",
      readSequence: 7,
      unreadCount: 2,
    });
    state = chatReducer(state, {
      type: "read.mine",
      conversationId: "c-team",
      readSequence: 3,
    });

    expect(state.conversations["c-team"].readSequence).toBe(7);
    expect(state.conversations["c-team"].unreadCount).toBe(2);
  });

  it("a direct peer reading acknowledges every own message up to that sequence", () => {
    let state = loaded("c-direct");

    for (const sequence of [1, 2, 3]) {
      state = chatReducer(state, {
        type: "message.received",
        message: makeMessage({
          conversationId: "c-direct",
          sequence,
          senderId: "u1",
          receipt: { readCount: 0, recipientCount: 1 },
        }),
        countAsUnread: false,
      });
    }

    state = chatReducer(state, {
      type: "read.peer",
      conversationId: "c-direct",
      upToSequence: 2,
    });

    const states = state.threads["c-direct"].messages.map(receiptStateOf);
    expect(states).toEqual(["read", "read", "sent"]);
    expect(state.conversations["c-direct"].peerReadSequence).toBe(2);
  });

  it("a stale receipts response never lowers a read count that a live event raised", () => {
    let state = loaded();

    state = chatReducer(state, {
      type: "message.received",
      message: makeMessage({
        sequence: 1,
        senderId: "u1",
        receipt: { readCount: 3, recipientCount: 5 },
      }),
      countAsUnread: false,
    });
    state = chatReducer(state, {
      type: "receipts",
      conversationId: "c-team",
      receipts: [
        { id: "msg-c-team-1", sequence: 1, readCount: 1, recipientCount: 5 },
      ],
    });

    expect(state.threads["c-team"].messages[0].receipt).toEqual({
      readCount: 3,
      recipientCount: 5,
    });
  });

  it("maps receipts to the three tick states", () => {
    const base = makeMessage({ senderId: "u1" });

    expect(receiptStateOf(base)).toBe("sent");
    expect(
      receiptStateOf({ ...base, receipt: { readCount: 0, recipientCount: 4 } }),
    ).toBe("sent");
    expect(
      receiptStateOf({ ...base, receipt: { readCount: 1, recipientCount: 4 } }),
    ).toBe("delivered");
    expect(
      receiptStateOf({ ...base, receipt: { readCount: 4, recipientCount: 4 } }),
    ).toBe("read");
  });
});

describe("chatReducer: pending sends", () => {
  it("tracks failed sends and lets them be retried or discarded", () => {
    let state = loaded();

    state = chatReducer(state, { type: "pending.add", pending: pending() });
    state = chatReducer(state, {
      type: "pending.update",
      conversationId: "c-team",
      clientMessageId: "client-1-xxxxxxxx",
      patch: { status: "failed", retryable: false },
    });
    expect(state.threads["c-team"].pending[0]).toMatchObject({
      status: "failed",
      retryable: false,
    });

    state = chatReducer(state, {
      type: "pending.remove",
      conversationId: "c-team",
      clientMessageId: "client-1-xxxxxxxx",
    });
    expect(state.threads["c-team"].pending).toEqual([]);
  });

  it("recovery after a reconnect retires a pending send that actually persisted", () => {
    let state = loaded();
    state = chatReducer(state, {
      type: "pending.add",
      pending: pending({ status: "failed" }),
    });

    state = chatReducer(state, {
      type: "thread.recovered",
      conversationId: "c-team",
      messages: [
        makeMessage({
          sequence: 1,
          senderId: "u1",
          clientMessageId: "client-1-xxxxxxxx",
        }),
      ],
    });

    expect(state.threads["c-team"].pending).toEqual([]);
    expect(state.threads["c-team"].messages).toHaveLength(1);
  });
});

describe("chatReducer: lists and presence", () => {
  it("sums unread counters and lists the team chat first", () => {
    const state = chatReducer(initialChatState, {
      type: "bootstrap",
      data: makeBootstrap({
        conversations: [
          makeDirect({ unreadCount: 2, updatedAt: "2026-10-13T10:00:00.000Z" }),
          makeConversation({
            unreadCount: 3,
            updatedAt: "2026-10-01T10:00:00.000Z",
          }),
        ],
      }),
    });

    expect(selectTotalUnread(state)).toBe(5);
    expect(selectConversationList(state).map((c) => c.type)).toEqual([
      "TEAM",
      "DIRECT",
    ]);
  });

  it("applies presence updates over the bootstrap values", () => {
    let state = chatReducer(initialChatState, {
      type: "bootstrap",
      data: makeBootstrap(),
    });
    expect(state.presence.u2.online).toBe(true);

    state = chatReducer(state, {
      type: "presence",
      userId: "u2",
      presence: { online: false, lastSeenAt: "2026-10-13T09:00:00.000Z" },
    });

    expect(state.presence.u2).toEqual({
      online: false,
      lastSeenAt: "2026-10-13T09:00:00.000Z",
    });
  });
});
