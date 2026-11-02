import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({
  API_BASE_URL: "http://api.example.test:3000",
  default: {},
}));

import { ChatStore } from "./chatStore";
import type { ChatAttachment, ChatSendResult } from "../types/chat";
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

const flush = () => vi.advanceTimersByTimeAsync(0);

const ATTACHMENT: ChatAttachment = {
  id: "att-1",
  kind: "IMAGE",
  contentType: "image/png",
  displayName: "photo.png",
  sizeBytes: 1234,
  width: 10,
  height: 8,
};

describe("ChatStore - sending with attachments", () => {
  let api: ReturnType<typeof makeApi>;
  let store: ChatStore;
  let ids: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    FakeSocket.reset();
    ids = 0;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    api = makeApi({
      getChatBootstrap: vi
        .fn()
        .mockResolvedValue(
          makeBootstrap({ conversations: [makeConversation(), makeDirect()] }),
        ),
    });
    store = new ChatStore({
      api,
      createSocket: (url) => new FakeSocket(url),
      socketUrl: "ws://test/chat/ws",
      newClientMessageId: () => `client-id-${(ids += 1)}-xxxxxxxx`,
    });

    store.start();
    await flush();
    FakeSocket.last().ready();
    await flush();
    api.getChatMessages.mockResolvedValue(emptyPage());
    await store.loadThread("c-direct");
    await store.loadThread("c-team");
  });

  afterEach(() => {
    store.stop();
    vi.useRealTimers();
  });

  const persisted = (clientMessageId: string, extra = {}) =>
    makeMessage({
      conversationId: "c-direct",
      sequence: 1,
      senderId: ME.id,
      senderName: ME.name,
      clientMessageId,
      body: "",
      ...extra,
    });

  it("text-only sends call the API with exactly the three original arguments", () => {
    api.sendChatMessage.mockReturnValue(new Promise(() => undefined));

    store.sendMessage("c-direct", "hello");

    expect(api.sendChatMessage).toHaveBeenCalledWith(
      "c-direct",
      "client-id-1-xxxxxxxx",
      "hello",
    );
    expect(api.sendChatMessage.mock.calls[0]).toHaveLength(3);
  });

  it("an empty message without an attachment is still refused", () => {
    expect(store.sendMessage("c-direct", "  ")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(api.sendChatMessage).not.toHaveBeenCalled();
  });

  it("sends an attachment-only message with the attachment id and an empty body", async () => {
    let resolve: (value: ChatSendResult) => void = () => undefined;
    api.sendChatMessage.mockReturnValue(new Promise((r) => (resolve = r)));

    const outcome = store.sendMessage("c-direct", "", ATTACHMENT);

    expect(outcome.ok).toBe(true);
    expect(api.sendChatMessage).toHaveBeenCalledWith(
      "c-direct",
      "client-id-1-xxxxxxxx",
      "",
      "att-1",
    );

    const pending = store.getSnapshot().threads["c-direct"].pending;
    expect(pending).toHaveLength(1);
    expect(pending[0].attachment).toEqual(ATTACHMENT);

    resolve({
      message: persisted("client-id-1-xxxxxxxx", { attachment: ATTACHMENT }),
      duplicate: false,
    });
    await flush();

    const thread = store.getSnapshot().threads["c-direct"];
    expect(thread.pending).toHaveLength(0);
    expect(thread.messages.at(-1)?.attachment?.id).toBe("att-1");
  });

  it("sends text together with the attachment", () => {
    api.sendChatMessage.mockReturnValue(new Promise(() => undefined));

    store.sendMessage("c-direct", " look ", ATTACHMENT);

    expect(api.sendChatMessage).toHaveBeenCalledWith(
      "c-direct",
      "client-id-1-xxxxxxxx",
      "look",
      "att-1",
    );
  });

  it("never sends an attachment into the team conversation", () => {
    expect(store.sendMessage("c-team", "", ATTACHMENT)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(api.sendChatMessage).not.toHaveBeenCalled();
  });

  it("a retry re-sends the SAME client id and the SAME attachment (idempotent)", async () => {
    const httpError = Object.assign(new Error("net"), { isAxiosError: true });
    api.sendChatMessage.mockRejectedValueOnce(httpError);
    api.sendChatMessage.mockReturnValue(new Promise(() => undefined));

    store.sendMessage("c-direct", "", ATTACHMENT);
    await flush();

    const failed = store.getSnapshot().threads["c-direct"].pending[0];
    expect(failed.status).toBe("failed");

    store.retryMessage("c-direct", failed.clientMessageId);

    expect(api.sendChatMessage).toHaveBeenLastCalledWith(
      "c-direct",
      failed.clientMessageId,
      "",
      "att-1",
    );
    expect(api.sendChatMessage).toHaveBeenCalledTimes(2);
  });

  it("does not send the same pending message twice at once (duplicate submission)", () => {
    api.sendChatMessage.mockReturnValue(new Promise(() => undefined));

    store.sendMessage("c-direct", "", ATTACHMENT);
    const pending = store.getSnapshot().threads["c-direct"].pending[0];
    store.retryMessage("c-direct", pending.clientMessageId); // not failed: ignored

    expect(api.sendChatMessage).toHaveBeenCalledTimes(1);
  });
});
