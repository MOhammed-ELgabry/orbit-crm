import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("./api", () => ({ default: http, API_BASE_URL: "http://x.test" }));

import {
  getChatBootstrap,
  getChatMessages,
  getChatReceipts,
  getChatSession,
  httpStatusOf,
  isRetryableSendFailure,
  listChatConversations,
  listChatTeammates,
  markChatRead,
  openDirectConversation,
  sendChatMessage,
} from "./chatService";

const envelope = <T>(data: T) => ({ data: { success: true, data } });

function failure(status?: number) {
  return new AxiosError(
    "failed",
    undefined,
    undefined,
    undefined,
    status === undefined
      ? undefined
      : {
          status,
          statusText: "",
          headers: {},
          config: {} as never,
          data: {},
        },
  );
}

describe("chatService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("unwraps the standard envelope for reads", async () => {
    http.get.mockResolvedValueOnce(
      envelope({ me: { id: "u1" }, serverTime: "t" }),
    );
    await expect(getChatSession()).resolves.toEqual({
      me: { id: "u1" },
      serverTime: "t",
    });
    expect(http.get).toHaveBeenCalledWith("/chat/session");

    http.get.mockResolvedValueOnce(envelope({ conversations: [] }));
    await getChatBootstrap();
    expect(http.get).toHaveBeenLastCalledWith("/chat/bootstrap");

    http.get.mockResolvedValueOnce(envelope([]));
    await listChatConversations();
    expect(http.get).toHaveBeenLastCalledWith("/chat/conversations");
  });

  it("only sends a search term when there is one", async () => {
    http.get.mockResolvedValue(envelope([]));

    await listChatTeammates();
    expect(http.get).toHaveBeenLastCalledWith("/chat/teammates", {
      params: undefined,
    });

    await listChatTeammates("sara");
    expect(http.get).toHaveBeenLastCalledWith("/chat/teammates", {
      params: { search: "sara" },
    });
  });

  it("opens a direct conversation by teammate id only (no company, no sender)", async () => {
    http.post.mockResolvedValue(envelope({ id: "c1" }));

    await openDirectConversation("u2");

    expect(http.post).toHaveBeenCalledWith("/chat/conversations/direct", {
      userId: "u2",
    });
  });

  it("uses cursor params for history and encodes the conversation id", async () => {
    http.get.mockResolvedValue(envelope({ messages: [] }));

    await getChatMessages("a/b", { before: 31, limit: 30 });

    expect(http.get).toHaveBeenCalledWith(
      "/chat/conversations/a%2Fb/messages",
      {
        params: { before: 31, limit: 30 },
      },
    );
  });

  it("returns the receipts rows", async () => {
    http.get.mockResolvedValue(
      envelope({
        receipts: [{ id: "m", sequence: 1, readCount: 1, recipientCount: 2 }],
      }),
    );

    await expect(getChatReceipts("c1", 1, 5)).resolves.toHaveLength(1);
    expect(http.get).toHaveBeenCalledWith("/chat/conversations/c1/receipts", {
      params: { from: 1, to: 5 },
    });
  });

  it("sends exactly clientMessageId and body", async () => {
    http.post.mockResolvedValue(
      envelope({ message: { id: "m" }, duplicate: false }),
    );

    const result = await sendChatMessage("c1", "client-id-1-xxxxxxxx", "hello");

    expect(http.post).toHaveBeenCalledWith("/chat/conversations/c1/messages", {
      clientMessageId: "client-id-1-xxxxxxxx",
      body: "hello",
    });
    expect(result.duplicate).toBe(false);
  });

  it("acknowledges reads with the upToSequence cursor", async () => {
    http.post.mockResolvedValue(
      envelope({ conversationId: "c1", readSequence: 7, unreadCount: 0 }),
    );

    await expect(markChatRead("c1", 7)).resolves.toMatchObject({
      readSequence: 7,
    });
    expect(http.post).toHaveBeenCalledWith("/chat/conversations/c1/read", {
      upToSequence: 7,
    });
  });

  it("classifies send failures", () => {
    expect(httpStatusOf(failure(409))).toBe(409);
    expect(httpStatusOf(new Error("x"))).toBeUndefined();

    expect(isRetryableSendFailure(failure())).toBe(true); // network
    expect(isRetryableSendFailure(failure(500))).toBe(true);
    expect(isRetryableSendFailure(failure(503))).toBe(true);
    expect(isRetryableSendFailure(failure(429))).toBe(true);
    expect(isRetryableSendFailure(failure(408))).toBe(true);
    expect(isRetryableSendFailure(failure(401))).toBe(true);

    expect(isRetryableSendFailure(failure(400))).toBe(false);
    expect(isRetryableSendFailure(failure(403))).toBe(false);
    expect(isRetryableSendFailure(failure(404))).toBe(false);
    expect(isRetryableSendFailure(failure(409))).toBe(false);
  });
});
