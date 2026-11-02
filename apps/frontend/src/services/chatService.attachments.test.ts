import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./api", () => ({ default: http, API_BASE_URL: "http://x.test" }));

import {
  cancelChatAttachment,
  fetchChatAttachmentBlob,
  getChatAttachmentConfig,
  sendChatMessage,
  uploadChatAttachment,
} from "./chatService";

const envelope = <T>(data: T) => ({ data: { success: true, data } });

describe("chatService - attachments", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("sendChatMessage", () => {
    it("sends exactly { clientMessageId, body } for a text-only message (unchanged contract)", async () => {
      http.post.mockResolvedValueOnce(
        envelope({ message: {}, duplicate: false }),
      );

      await sendChatMessage("c1", "client-1", "hi");

      expect(http.post).toHaveBeenCalledWith(
        "/chat/conversations/c1/messages",
        {
          clientMessageId: "client-1",
          body: "hi",
        },
      );
      expect(Object.keys(http.post.mock.calls[0][1])).toEqual([
        "clientMessageId",
        "body",
      ]);
    });

    it("adds attachmentId only when there is one (attachment-only: empty body)", async () => {
      http.post.mockResolvedValueOnce(
        envelope({ message: {}, duplicate: false }),
      );

      await sendChatMessage("c1", "client-1", "", "att-9");

      expect(http.post).toHaveBeenCalledWith(
        "/chat/conversations/c1/messages",
        {
          clientMessageId: "client-1",
          body: "",
          attachmentId: "att-9",
        },
      );
    });
  });

  it("reads the attachment configuration", async () => {
    http.get.mockResolvedValueOnce(envelope({ enabled: false }));

    await expect(getChatAttachmentConfig()).resolves.toEqual({
      enabled: false,
    });
    expect(http.get).toHaveBeenCalledWith("/chat/attachments/config");
  });

  describe("uploadChatAttachment", () => {
    const attachment = {
      id: "a1",
      kind: "IMAGE",
      contentType: "image/png",
      displayName: "p.png",
      sizeBytes: 3,
      width: 1,
      height: 1,
    };

    it('posts ONE multipart field named "file" and sets no Content-Type by hand', async () => {
      http.post.mockResolvedValueOnce(
        envelope({ attachment, expiresAt: "2026-11-01T12:00:00.000Z" }),
      );
      const file = new File([new Uint8Array([1, 2, 3])], "p.png", {
        type: "image/png",
      });

      const result = await uploadChatAttachment("c 1", file);

      const [url, body, options] = http.post.mock.calls[0] as [
        string,
        FormData,
        { headers?: unknown },
      ];

      expect(url).toBe("/chat/conversations/c%201/attachments");
      expect(body).toBeInstanceOf(FormData);
      expect([...body.keys()]).toEqual(["file"]);
      expect((body.get("file") as File).name).toBe("p.png");
      expect(options.headers).toBeUndefined();
      expect(result.attachment.id).toBe("a1");
    });

    it("passes the abort signal and reports progress as a 0..1 fraction", async () => {
      const controller = new AbortController();
      const progress = vi.fn();
      http.post.mockImplementationOnce(
        (
          _url: string,
          _body: unknown,
          options: { onUploadProgress: (e: object) => void },
        ) => {
          options.onUploadProgress({ loaded: 25, total: 100 });
          options.onUploadProgress({ loaded: 100, total: 100 });
          options.onUploadProgress({ loaded: 5 }); // no total: ignored
          return Promise.resolve(envelope({ attachment, expiresAt: "x" }));
        },
      );

      await uploadChatAttachment("c1", new File(["x"], "p.png"), {
        signal: controller.signal,
        onProgress: progress,
      });

      expect(http.post.mock.calls[0][2].signal).toBe(controller.signal);
      expect(progress.mock.calls.map((c) => c[0])).toEqual([0.25, 1]);
    });
  });

  it("cancels (discards) an unsent attachment with an encoded DELETE", async () => {
    http.delete.mockResolvedValueOnce({});

    await cancelChatAttachment("c1", "a/1");

    expect(http.delete).toHaveBeenCalledWith(
      "/chat/conversations/c1/attachments/a%2F1",
    );
  });

  it("downloads through the authenticated endpoint as a Blob (no public URL)", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    http.get.mockResolvedValueOnce({ data: blob });
    const controller = new AbortController();

    await expect(
      fetchChatAttachmentBlob("c1", "a1", controller.signal),
    ).resolves.toBe(blob);

    expect(http.get).toHaveBeenCalledWith(
      "/chat/conversations/c1/attachments/a1",
      expect.objectContaining({
        responseType: "blob",
        signal: controller.signal,
      }),
    );
  });
});
