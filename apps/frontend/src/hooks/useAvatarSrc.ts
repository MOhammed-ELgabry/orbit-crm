import { useEffect, useState } from "react";

import { loadAvatarUrl } from "../lib/avatar";

/**
 * The displayable URL of a user's picture, or null while it loads, when the
 * user has none, or when it cannot be loaded (the caller shows initials).
 * Switching to a new reference (the picture was just changed) drops the old
 * picture straight away rather than showing it until the new one arrives.
 */
export function useAvatarSrc(ref: string | null | undefined): string | null {
  const [loaded, setLoaded] = useState<{ ref: string; url: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    if (!ref) return undefined;

    void loadAvatarUrl(ref).then((url) => {
      if (!cancelled && url) setLoaded({ ref, url });
    });

    return () => {
      cancelled = true;
    };
  }, [ref]);

  return ref && loaded && loaded.ref === ref ? loaded.url : null;
}
