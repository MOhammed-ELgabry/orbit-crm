import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  uploadChatAttachment: vi.fn(),
  cancelChatAttachment: vi.fn(),
}));

vi.mock("../services/chatService", () => service);

import { useChatAttachmentUpload } from "./useChatAttachmentUpload";
import type { ChatAttachment } from "../types/chat";

const CONFIG = {
  enabled: true as const,
  imageMaxBytes: 5 * 1024 * 1024,
  pdfMaxBytes: 10 * 1024 * 1024,
  allowedContentTypes: ["image/png", "application/pdf"],
  readyTtlMs: 60_000,
};

const ATTACHMENT: ChatAttachment = {
  id: "att-1",
  kind: "IMAGE",
  contentType: "image/png",
  displayName: "p.png",
  sizeBytes: 3,
  width: 1,
  height: 1,
};

const png = (size = 3) =>
  new File([new Uint8Array(size)], "p.png", { type: "image/png" });

function deferredUpload() {
  let resolve: (value: unknown) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useChatAttachmentUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.cancelChatAttachment.mockResolvedValue(undefined);
  });

  it("goes idle -> uploading (with progress) -> ready", async () => {
    const upload = deferredUpload();
    service.uploadChatAttachment.mockImplementation(
      (_c: string, _f: File, options: { onProgress: (n: number) => void }) => {
        options.onProgress(0.5);
        return upload.promise;
      },
    );

    const { result } = renderHook(() => useChatAttachmentUpload("c1", CONFIG));
    expect(result.current.state.phase).toBe("idle");

    act(() => result.current.select(png()));

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        phase: "uploading",
        progress: 0.5,
      }),
    );

    await act(async () => {
      upload.resolve({ attachment: ATTACHMENT, expiresAt: "x" });
      await upload.promise;
    });

    expect(result.current.state).toMatchObject({
      phase: "ready",
      attachment: { id: "att-1" },
    });
    expect(service.uploadChatAttachment).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported or oversized file locally, without any upload", () => {
    const { result } = renderHook(() => useChatAttachmentUpload("c1", CONFIG));

    act(() =>
      result.current.select(new File(["x"], "a.gif", { type: "image/gif" })),
    );
    expect(result.current.state).toMatchObject({
      phase: "failed",
      messageKey: "chatAttachmentErrUnsupported",
      retryable: false,
    });

    act(() => result.current.select(png(5 * 1024 * 1024 + 1)));
    expect(result.current.state).toMatchObject({
      phase: "failed",
      messageKey: "chatAttachmentErrTooLarge",
    });

    act(() =>
      result.current.select(new File([], "e.png", { type: "image/png" })),
    );
    expect(result.current.state).toMatchObject({
      phase: "failed",
      messageKey: "chatAttachmentErrEmpty",
    });

    expect(service.uploadChatAttachment).not.toHaveBeenCalled();
  });

  it("shows a server refusal, and only a retryable failure can be retried with the same file", async () => {
    service.uploadChatAttachment.mockRejectedValueOnce(
      new Error("Network Error"),
    );

    const { result } = renderHook(() => useChatAttachmentUpload("c1", CONFIG));
    act(() => result.current.select(png()));

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        phase: "failed",
        retryable: true,
        messageKey: "chatAttachmentErrNetwork",
      }),
    );

    service.uploadChatAttachment.mockResolvedValueOnce({
      attachment: ATTACHMENT,
      expiresAt: "x",
    });
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    expect(service.uploadChatAttachment).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable failure", async () => {
    service.uploadChatAttachment.mockRejectedValueOnce(
      Object.assign(new Error("x"), {
        isAxiosError: true,
        response: { status: 400, data: { message: "attachment_corrupt" } },
      }),
    );

    const { result } = renderHook(() => useChatAttachmentUpload("c1", CONFIG));
    act(() => result.current.select(png()));
    await waitFor(() => expect(result.current.state.phase).toBe("failed"));

    act(() => result.current.retry());

    expect(service.uploadChatAttachment).toHaveBeenCalledTimes(1);
  });

  it("cancelling during the upload aborts the request and leaves nothing behind", async () => {
    let signal: AbortSignal | undefined;
    const upload = deferredUpload();
    service.uploadChatAttachment.mockImplementation(
      (_c: string, _f: File, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return upload.promise;
      },
    );

    const { result } = renderHook(() => useChatAttachmentUpload("c1", CONFIG));
    act(() => result.current.select(png()));
    act(() => result.current.cancel());

    expect(signal?.aborted).toBe(true);
    expect(result.current.state.phase).toBe("idle");
    expect(service.cancelChatAttachment).not.toHaveBeenCalled();
  });

  it("an upload that finishes AFTER cancel is discarded on the server (no orphan)", async () => {
    const upload = deferredUpload();
    service.uploadChatAttachment.mockReturnValue(upload.promise);

    const { result } = renderHook(() => useChatAttachmentUpload("c1", CONFIG));
    act(() => result.current.select(png()));
    act(() => result.current.cancel());

    await act(async () => {
      upload.resolve({ attachment: ATTACHMENT, expiresAt: "x" });
      await upload.promise;
    });

    expect(result.current.state.phase).toBe("idle");
    expect(service.cancelChatAttachment).toHaveBeenCalledWith("c1", "att-1");
  });

  it("removing a ready attachment discards it on the server", async () => {
    service.uploadChatAttachment.mockResolvedValue({
      attachment: ATTACHMENT,
      expiresAt: "x",
    });

    const { result } = renderHook(() => useChatAttachmentUpload("c1", CONFIG));
    act(() => result.current.select(png()));
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));

    act(() => result.current.cancel());

    expect(result.current.state.phase).toBe("idle");
    expect(service.cancelChatAttachment).toHaveBeenCalledWith("c1", "att-1");
  });

  it("choosing another file replaces (and discards) a ready one: never two attachments", async () => {
    service.uploadChatAttachment.mockResolvedValue({
      attachment: ATTACHMENT,
      expiresAt: "x",
    });

    const { result } = renderHook(() => useChatAttachmentUpload("c1", CONFIG));
    act(() => result.current.select(png()));
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));

    service.uploadChatAttachment.mockResolvedValue({
      attachment: { ...ATTACHMENT, id: "att-2" },
      expiresAt: "x",
    });
    act(() => result.current.select(png()));

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        phase: "ready",
        attachment: { id: "att-2" },
      }),
    );
    expect(service.cancelChatAttachment).toHaveBeenCalledWith("c1", "att-1");
  });

  it("a second file picked while one is uploading supersedes it (only the last result counts)", async () => {
    const first = deferredUpload();
    const second = deferredUpload();
    service.uploadChatAttachment
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useChatAttachmentUpload("c1", CONFIG));
    act(() => result.current.select(png()));
    act(() => result.current.select(png()));

    await act(async () => {
      second.resolve({
        attachment: { ...ATTACHMENT, id: "att-2" },
        expiresAt: "x",
      });
      await second.promise;
      first.resolve({ attachment: ATTACHMENT, expiresAt: "x" });
      await first.promise;
    });

    expect(result.current.state).toMatchObject({
      phase: "ready",
      attachment: { id: "att-2" },
    });
    // the superseded upload is discarded on the server
    expect(service.cancelChatAttachment).toHaveBeenCalledWith("c1", "att-1");
  });

  it("consume (message sent) clears the state WITHOUT deleting the now-sent attachment", async () => {
    service.uploadChatAttachment.mockResolvedValue({
      attachment: ATTACHMENT,
      expiresAt: "x",
    });

    const { result, unmount } = renderHook(() =>
      useChatAttachmentUpload("c1", CONFIG),
    );
    act(() => result.current.select(png()));
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));

    act(() => result.current.consume());
    unmount();

    expect(result.current.state.phase).toBe("idle");
    expect(service.cancelChatAttachment).not.toHaveBeenCalled();
  });

  it("leaving the conversation with an unsent ready attachment discards it", async () => {
    service.uploadChatAttachment.mockResolvedValue({
      attachment: ATTACHMENT,
      expiresAt: "x",
    });

    const { result, unmount } = renderHook(() =>
      useChatAttachmentUpload("c1", CONFIG),
    );
    act(() => result.current.select(png()));
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));

    unmount();

    expect(service.cancelChatAttachment).toHaveBeenCalledWith("c1", "att-1");
  });

  it("a ready attachment expires locally shortly before the server drops it", async () => {
    vi.useFakeTimers();
    try {
      service.uploadChatAttachment.mockResolvedValue({
        attachment: ATTACHMENT,
        expiresAt: "x",
      });

      const { result } = renderHook(() =>
        useChatAttachmentUpload("c1", CONFIG),
      );
      act(() => result.current.select(png()));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.state.phase).toBe("ready");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(CONFIG.readyTtlMs - 5_000);
      });

      expect(result.current.state.phase).toBe("expired");

      // an expired attachment can be uploaded again from the same file
      service.uploadChatAttachment.mockResolvedValue({
        attachment: { ...ATTACHMENT, id: "att-3" },
        expiresAt: "x",
      });
      act(() => result.current.retry());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.state).toMatchObject({
        phase: "ready",
        attachment: { id: "att-3" },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
