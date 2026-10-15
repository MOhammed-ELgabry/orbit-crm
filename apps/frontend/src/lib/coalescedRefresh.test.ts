import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCoalescedRefresh } from "./coalescedRefresh";

describe("createCoalescedRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs nothing until the delay has elapsed", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const refresh = createCoalescedRefresh(task, 1000);

    refresh.request();
    await vi.advanceTimersByTimeAsync(999);
    expect(task).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("merges a burst into ONE run and does not restart the window", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const refresh = createCoalescedRefresh(task, 1000);

    refresh.request();
    await vi.advanceTimersByTimeAsync(600);
    refresh.request();
    refresh.request();
    await vi.advanceTimersByTimeAsync(400);

    // Fired 1000ms after the FIRST request (no starvation under a stream).
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("never overlaps: a request during a run schedules exactly one follow-up", async () => {
    let release: () => void = () => undefined;
    let concurrent = 0;
    let maxConcurrent = 0;
    const task = vi.fn(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      concurrent -= 1;
    });
    const refresh = createCoalescedRefresh(task, 1000);

    refresh.request();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);

    refresh.request();
    refresh.request();
    await vi.advanceTimersByTimeAsync(3000);
    expect(task).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);

    release();
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
  });

  it("swallows a rejected or throwing task and keeps working", async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementationOnce(() => {
        throw new Error("sync");
      })
      .mockResolvedValue(undefined);
    const refresh = createCoalescedRefresh(task, 100);

    refresh.request();
    await vi.advanceTimersByTimeAsync(100);
    refresh.request();
    await vi.advanceTimersByTimeAsync(100);
    refresh.request();
    await vi.advanceTimersByTimeAsync(100);

    expect(task).toHaveBeenCalledTimes(3);
  });

  it("skips the run when the gate says no (e.g. hidden tab)", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    let visible = false;
    const refresh = createCoalescedRefresh(task, 100, () => visible);

    refresh.request();
    await vi.advanceTimersByTimeAsync(100);
    expect(task).not.toHaveBeenCalled();

    visible = true;
    refresh.request();
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("cancel() drops the pending run and ignores later requests", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const refresh = createCoalescedRefresh(task, 100);

    refresh.request();
    refresh.cancel();
    refresh.request();
    await vi.advanceTimersByTimeAsync(1000);

    expect(task).not.toHaveBeenCalled();
  });

  it("cancel() during a run prevents the queued follow-up", async () => {
    let release: () => void = () => undefined;
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const refresh = createCoalescedRefresh(task, 100);

    refresh.request();
    await vi.advanceTimersByTimeAsync(100);
    refresh.request();
    refresh.cancel();
    release();
    await vi.advanceTimersByTimeAsync(1000);

    expect(task).toHaveBeenCalledTimes(1);
  });
});
