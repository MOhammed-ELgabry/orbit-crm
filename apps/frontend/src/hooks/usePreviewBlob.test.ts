import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePreviewBlob } from "./usePreviewBlob";

const blobA = new Blob(["a"]);
const blobB = new Blob(["b"]);

describe("usePreviewBlob", () => {
  let create: ReturnType<typeof vi.spyOn>;
  let revoke: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    let n = 0;
    create = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => `blob:t/${(n += 1)}`);
    revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts empty and creates no URL", () => {
    const { result } = renderHook(() => usePreviewBlob());

    expect(result.current[0]).toBeNull();
    expect(result.current[1]).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("previews a blob and revokes the previous URL when it is replaced", () => {
    const { result } = renderHook(() => usePreviewBlob());

    act(() => result.current[2](blobA));
    expect(result.current[1]).toBe("blob:t/1");

    act(() => result.current[2](blobB));
    expect(result.current[1]).toBe("blob:t/2");
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:t/1");
  });

  it("revokes and clears when the picture is dropped", () => {
    const { result } = renderHook(() => usePreviewBlob());

    act(() => result.current[2](blobA));
    act(() => result.current[2](null));

    expect(result.current[1]).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:t/1");
  });

  it("revokes the live URL on unmount", () => {
    const { result, unmount } = renderHook(() => usePreviewBlob());

    act(() => result.current[2](blobA));
    unmount();

    expect(revoke).toHaveBeenCalledWith("blob:t/1");
  });
});
