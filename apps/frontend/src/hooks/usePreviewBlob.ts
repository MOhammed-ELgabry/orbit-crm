import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Holds one picked image and an object URL to preview it.
 *
 * The URL is created and revoked inside `setBlob` (an event-handler path), not
 * in an effect, so React never re-renders because of an effect's setState and
 * there is exactly one URL alive at a time. It is also revoked on unmount.
 */
export function usePreviewBlob() {
  const urlRef = useRef<string | null>(null);
  const [state, setState] = useState<{ blob: Blob | null; url: string | null }>(
    { blob: null, url: null },
  );

  const setBlob = useCallback((blob: Blob | null) => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }

    urlRef.current = blob ? URL.createObjectURL(blob) : null;
    setState({ blob, url: urlRef.current });
  }, []);

  useEffect(
    () => () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    },
    [],
  );

  return [state.blob, state.url, setBlob] as const;
}
