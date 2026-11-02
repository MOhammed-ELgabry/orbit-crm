import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ fetchChatAttachmentBlob: vi.fn() }));

vi.mock("../services/chatService", () => service);

import { useAuthenticatedBlob } from "./useAuthenticatedBlob";

describe("useAuthenticatedBlob (Blob URL lifecycle)", () => {
  let created: string[];
  let revoked: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    created = [];
    revoked = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      const url = `blob:orbit-test/${created.length + 1}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      revoked.push(url);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const image = () => new Blob(["x"], { type: "image/png" });

  it("does not fetch while disabled (off-screen image)", () => {
    const { result } = renderHook(() =>
      useAuthenticatedBlob("c1", "a1", "image/", false),
    );

    expect(result.current.status).toBe("idle");
    expect(service.fetchChatAttachmentBlob).not.toHaveBeenCalled();
  });

  it("fetches through the authenticated service and exposes a blob: URL", async () => {
    service.fetchChatAttachmentBlob.mockResolvedValue(image());

    const { result } = renderHook(() =>
      useAuthenticatedBlob("c1", "a1", "image/", true),
    );

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.url).toBe("blob:orbit-test/1");
    expect(service.fetchChatAttachmentBlob).toHaveBeenCalledWith(
      "c1",
      "a1",
      expect.any(AbortSignal),
    );
  });

  it("revokes the URL on unmount", async () => {
    service.fetchChatAttachmentBlob.mockResolvedValue(image());

    const { result, unmount } = renderHook(() =>
      useAuthenticatedBlob("c1", "a1", "image/", true),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    unmount();

    expect(revoked).toEqual(["blob:orbit-test/1"]);
  });

  it("revokes the previous URL when the attachment changes", async () => {
    service.fetchChatAttachmentBlob.mockResolvedValue(image());

    const { result, rerender } = renderHook(
      ({ id }) => useAuthenticatedBlob("c1", id, "image/", true),
      { initialProps: { id: "a1" } },
    );
    await waitFor(() => expect(result.current.url).toBe("blob:orbit-test/1"));

    rerender({ id: "a2" });

    await waitFor(() => expect(result.current.url).toBe("blob:orbit-test/2"));
    expect(revoked).toContain("blob:orbit-test/1");
  });

  it("aborts the request and creates no URL when unmounted before it finishes", async () => {
    let signal: AbortSignal | undefined;
    let finish: (blob: Blob) => void = () => undefined;
    service.fetchChatAttachmentBlob.mockImplementation(
      (_c: string, _a: string, s: AbortSignal) => {
        signal = s;
        return new Promise<Blob>((resolve) => (finish = resolve));
      },
    );

    const { unmount } = renderHook(() =>
      useAuthenticatedBlob("c1", "a1", "image/", true),
    );
    unmount();
    finish(image());
    await Promise.resolve();

    expect(signal?.aborted).toBe(true);
    expect(created).toEqual([]);
  });

  it("never displays something that is not the expected type", async () => {
    service.fetchChatAttachmentBlob.mockResolvedValue(
      new Blob(["<html></html>"], { type: "text/html" }),
    );

    const { result } = renderHook(() =>
      useAuthenticatedBlob("c1", "a1", "image/", true),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.url).toBeNull();
    expect(created).toEqual([]);
  });

  it("reports a failed load and can retry", async () => {
    service.fetchChatAttachmentBlob.mockRejectedValueOnce(
      new Error("Network Error"),
    );
    service.fetchChatAttachmentBlob.mockResolvedValueOnce(image());

    const { result } = renderHook(() =>
      useAuthenticatedBlob("c1", "a1", "image/", true),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.retryable).toBe(true);

    result.current.retry();

    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});
