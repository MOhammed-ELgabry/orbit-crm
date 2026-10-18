import { useCallback, useEffect, useState } from "react";
import axios from "axios";

export type ResourceStatus =
  "idle" | "loading" | "ready" | "error" | "forbidden" | "not-found";

type SettledStatus = Exclude<ResourceStatus, "idle" | "loading">;

interface Settled<T> {
  /** The request this result belongs to (key + attempt). */
  key: string;
  status: SettledStatus;
  data: T | null;
}

export interface KeyedResource<T> {
  status: ResourceStatus;
  /** Non-null only while `status === "ready"`, and only for the current key. */
  data: T | null;
  /** Re-runs the request for the current key (e.g. a Retry button). */
  retry: () => void;
  /** Replaces the loaded data (e.g. after the user edits it), keeping "ready". */
  replaceData: (next: T) => void;
}

function classify(error: unknown): SettledStatus {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) return "forbidden";
    if (error.response?.status === 404) return "not-found";
  }
  return "error";
}

/**
 * Loads one resource that belongs to `key` (typically a contact id), and
 * guarantees the page can never show data that belongs to a different key.
 *
 * - `status` and `data` are DERIVED: a result is only used while its `key`
 *   equals the current request key. The moment `key` changes (or Retry is
 *   pressed) the status is "loading" and the previous data is gone, so a
 *   previous contact's data cannot flash while the next one loads.
 * - A response that arrives after its request was superseded (key changed,
 *   Retry pressed, or the component unmounted) is discarded and never
 *   written, so a slow old response cannot overwrite a newer one.
 * - Nothing is set synchronously inside the effect (only in the promise
 *   callbacks), which is what react-hooks/set-state-in-effect requires.
 *
 * `load` MUST be memoised (useCallback) on the same inputs as `key`.
 * Pass `key = null` to leave the resource idle (nothing is requested) -
 * used when the user lacks permission for this source, so no request is
 * made at all. The backend still enforces its own permission on every
 * endpoint; hiding a section is only a UX decision, never the protection.
 */
export function useKeyedResource<T>(
  key: string | null,
  load: () => Promise<T>,
): KeyedResource<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  const requestKey = key === null ? null : `${key}:${attempt}`;

  useEffect(() => {
    if (requestKey === null) return;

    let isStale = false;

    load()
      .then((data) => {
        if (isStale) return;
        setSettled({ key: requestKey, status: "ready", data });
      })
      .catch((error: unknown) => {
        if (isStale) return;
        setSettled({ key: requestKey, status: classify(error), data: null });
      });

    return () => {
      isStale = true;
    };
  }, [load, requestKey]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  // Only replaces the result of THIS request, and only once it is ready. An
  // async handler that closed over an earlier key's `replaceData` (e.g. a
  // "save notes" that finishes after the user moved to another contact) is
  // therefore a no-op: it can neither overwrite nor wipe the current key's
  // result, and it can never turn a loading/failed request into "ready".
  const replaceData = useCallback(
    (next: T) => {
      if (requestKey === null) return;
      setSettled((previous) =>
        previous !== null &&
        previous.key === requestKey &&
        previous.status === "ready"
          ? { ...previous, data: next }
          : previous,
      );
    },
    [requestKey],
  );

  if (requestKey === null) {
    return { status: "idle", data: null, retry, replaceData };
  }

  const current = settled?.key === requestKey ? settled : null;

  return {
    status: current ? current.status : "loading",
    data: current?.status === "ready" ? current.data : null,
    retry,
    replaceData,
  };
}
