import { useEffect, useState } from "react";

import { getChatAttachmentConfig } from "../services/chatService";
import type { ChatAttachmentConfig } from "../types/chat";

type EnabledConfig = Extract<ChatAttachmentConfig, { enabled: true }>;

/** One answer is shared by every composer for a short time. */
const CACHE_MS = 60_000;

let cache: { at: number; value: EnabledConfig | null } | null = null;

/** Test helper: forget the cached answer. */
export function resetChatAttachmentConfigCache(): void {
  cache = null;
}

const fresh = (): EnabledConfig | null | undefined =>
  cache && Date.now() - cache.at < CACHE_MS ? cache.value : undefined;

/**
 * The attachment limits, or null when attachments are not available for this
 * account / conversation (feature off, ineligible user, request failed, or
 * `active` is false). Null hides the attach button: a UI nicety only - the
 * server decides on every request.
 */
export function useChatAttachmentConfig(active: boolean): EnabledConfig | null {
  const [config, setConfig] = useState<EnabledConfig | null | undefined>(fresh);

  useEffect(() => {
    if (!active || config !== undefined) return;

    let cancelled = false;

    // An async IIFE turns even a synchronous failure into a handled one.
    void (async () => {
      let value: EnabledConfig | null = null;

      try {
        const answer = await getChatAttachmentConfig();
        value = answer.enabled ? answer : null;
        cache = { at: Date.now(), value };
      } catch {
        value = null;
      }

      if (!cancelled) setConfig(value);
    })();

    return () => {
      cancelled = true;
    };
  }, [active, config]);

  return active ? (config ?? null) : null;
}
