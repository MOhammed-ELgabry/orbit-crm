import { useCallback } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it, vi } from "vitest";

import { useKeyedResource } from "./useKeyedResource";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const httpError = (status: number) =>
  new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
  } as AxiosResponse);

describe("useKeyedResource", () => {
  it("is loading, then ready with the loaded data", async () => {
    const request = deferred<string>();
    const load = vi.fn(() => request.promise);

    const { result } = renderHook(() => useKeyedResource("a", load));

    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();

    await act(async () => request.resolve("data-a"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data).toBe("data-a");
  });

  it("does nothing, and reports idle, while the key is null", () => {
    const load = vi.fn(() => Promise.resolve("never"));

    const { result } = renderHook(() => useKeyedResource(null, load));

    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("classifies 403 as forbidden, 404 as not-found and anything else as error", async () => {
    for (const [error, expected] of [
      [httpError(403), "forbidden"],
      [httpError(404), "not-found"],
      [httpError(500), "error"],
      [new Error("network down"), "error"],
    ] as const) {
      const load = vi.fn(() => Promise.reject(error));
      const { result } = renderHook(() => useKeyedResource("a", load));

      await waitFor(() => expect(result.current.status).toBe(expected));
      expect(result.current.data).toBeNull();
    }
  });

  it("drops the previous key's data the moment the key changes, and ignores that key's late response", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loaders: Record<string, () => Promise<string>> = {
      a: () => first.promise,
      b: () => second.promise,
    };

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useKeyedResource(
          id,
          // Stable per id, as callers memoise it.
          loaders[id],
        ),
      { initialProps: { id: "a" } },
    );

    await act(async () => first.resolve("data-a"));
    expect(result.current.data).toBe("data-a");

    // Switch to "b": "a"'s data must disappear immediately, before b answers.
    rerender({ id: "b" });
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();

    await act(async () => second.resolve("data-b"));
    expect(result.current.status).toBe("ready");
    expect(result.current.data).toBe("data-b");
  });

  it("never lets a slow response for the old key overwrite the newer key's result", async () => {
    const slowOld = deferred<string>();
    const fastNew = deferred<string>();
    const loaders: Record<string, () => Promise<string>> = {
      old: () => slowOld.promise,
      new: () => fastNew.promise,
    };

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useKeyedResource(id, loaders[id]),
      { initialProps: { id: "old" } },
    );

    rerender({ id: "new" });
    await act(async () => fastNew.resolve("data-new"));
    expect(result.current.data).toBe("data-new");

    // The old request finally answers - after the new one already did.
    await act(async () => slowOld.resolve("data-old"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data).toBe("data-new");
  });

  it("ignores a stale failure as well", async () => {
    const slowOld = deferred<string>();
    const fastNew = deferred<string>();
    const loaders: Record<string, () => Promise<string>> = {
      old: () => slowOld.promise,
      new: () => fastNew.promise,
    };

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useKeyedResource(id, loaders[id]),
      { initialProps: { id: "old" } },
    );

    rerender({ id: "new" });
    await act(async () => fastNew.resolve("data-new"));
    await act(async () => slowOld.reject(httpError(500)));

    expect(result.current.status).toBe("ready");
    expect(result.current.data).toBe("data-new");
  });

  it("retry re-runs the request and recovers from an error", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce("recovered");

    const { result } = renderHook(() => useKeyedResource("a", load));

    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("replaceData swaps in new data while staying ready", async () => {
    const load = vi.fn(() => Promise.resolve("before"));
    const { result } = renderHook(() => useKeyedResource("a", load));

    await waitFor(() => expect(result.current.data).toBe("before"));

    act(() => result.current.replaceData("after"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data).toBe("after");
  });

  it("a replaceData captured for an earlier key can neither overwrite nor wipe the current key's result", async () => {
    // The page keeps an async handler (e.g. "save notes") that closed over
    // the replaceData of the contact it was started on. If the user has
    // moved to another contact by the time the save finishes, that late
    // call must be ignored.
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => {
        const load = useCallback(() => Promise.resolve(`data-${id}`), [id]);
        return useKeyedResource(id, load);
      },
      { initialProps: { id: "a" } },
    );
    await waitFor(() => expect(result.current.data).toBe("data-a"));
    const replaceDataOfA = result.current.replaceData;

    rerender({ id: "b" });
    await waitFor(() => expect(result.current.data).toBe("data-b"));

    act(() => replaceDataOfA("late-save-of-a"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data).toBe("data-b");
  });

  it("replaceData is ignored while the request is not ready (it never fabricates a ready state)", async () => {
    const request = deferred<string>();
    // `load` must be a stable reference (see the hook's contract).
    const load = () => request.promise;
    const { result } = renderHook(() => useKeyedResource("a", load));

    act(() => result.current.replaceData("too early"));

    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();
    await act(async () => request.resolve("real"));
    expect(result.current.data).toBe("real");
  });

  it("does not write state after unmount", async () => {
    const request = deferred<string>();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = renderHook(() =>
      useKeyedResource("a", () => request.promise),
    );
    unmount();

    await act(async () => request.resolve("late"));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
