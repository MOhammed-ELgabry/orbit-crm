/**
 * Coalesces bursts of "please refresh" requests into at most ONE run per
 * window, never overlapping:
 *
 *  - the first request starts a timer (`delayMs`); further requests inside
 *    the window are absorbed (the timer is NOT restarted, so a constant
 *    stream of requests cannot starve the refresh);
 *  - when the timer fires the task runs once; a request that arrives while
 *    the task is still running schedules exactly one follow-up run;
 *  - the task's failure (sync throw or rejected promise) is swallowed: it
 *    is a best-effort UI refresh and must never affect the caller;
 *  - `cancel()` drops anything pending and makes late completions inert.
 */
export interface CoalescedRefresh {
  request: () => void;
  cancel: () => void;
}

export function createCoalescedRefresh(
  task: () => Promise<void> | void,
  delayMs: number,
  /** Optional gate evaluated when the timer fires (e.g. tab visible). */
  shouldRun: () => boolean = () => true,
): CoalescedRefresh {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;
  let cancelled = false;

  const schedule = () => {
    if (cancelled || timer !== undefined) return;

    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delayMs);
  };

  const run = async () => {
    if (cancelled) return;

    if (running) {
      queued = true;
      return;
    }

    if (!shouldRun()) return;

    running = true;

    try {
      await task();
    } catch {
      // Best effort only.
    } finally {
      running = false;
    }

    if (queued && !cancelled) {
      queued = false;
      schedule();
    }
  };

  return {
    request: () => {
      if (cancelled) return;

      // A run is in flight: remember to run once more afterwards instead
      // of overlapping it.
      if (running) {
        queued = true;
        return;
      }

      schedule();
    },
    cancel: () => {
      cancelled = true;
      queued = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
