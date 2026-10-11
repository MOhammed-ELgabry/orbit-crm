import { useCallback, useEffect, useRef, useState } from "react";

export type ReportQueryState<T> =
  { status: "loading" } | { status: "error" } | { status: "ready"; data: T };

/**
 * Runs `fetcher` whenever `key` changes and exposes loading / error /
 * ready. Superseded or unmounted requests are aborted, so a slow response
 * for an old period can never overwrite a newer one; an aborted request is
 * ignored rather than shown as an error.
 *
 * Deliberately has no retry loop: a failure shows the error state once and
 * the user retries explicitly. (A 401 is handled globally in api.ts, which
 * also never retries more than once.)
 */
export function useReportQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  key: string,
  enabled = true,
): ReportQueryState<T> & { reload: () => void } {
  const [reloadToken, setReloadToken] = useState(0);
  // The outcome is stored together with the request it belongs to, so
  // "loading" is DERIVED (no stored outcome for the current key/reload)
  // instead of being set synchronously inside the effect, and an outcome
  // left over from an earlier period can never be shown for a newer one.
  const [result, setResult] = useState<{
    id: string;
    outcome: Exclude<ReportQueryState<T>, { status: "loading" }>;
  } | null>(null);
  const fetcherRef = useRef(fetcher);
  const requestId = `${key}#${reloadToken}`;

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult({ id: requestId, outcome: { status: "ready", data } });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ id: requestId, outcome: { status: "error" } });
        }
      });

    return () => controller.abort();
  }, [requestId, enabled]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const state: ReportQueryState<T> =
    result && result.id === requestId ? result.outcome : { status: "loading" };

  return { ...state, reload };
}
