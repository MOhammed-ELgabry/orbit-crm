import { useCallback, useEffect, useState } from "react";

import { failureOf, type AttachmentFailure } from "../lib/chatAttachments";
import { fetchChatAttachmentBlob } from "../services/chatService";

export type BlobStatus = "idle" | "loading" | "ready" | "error";

interface Settled {
  key: string;
  url?: string;
  error?: AttachmentFailure;
}

/**
 * Loads an attachment through the authenticated endpoint and exposes it as a
 * short-lived object URL. The URL is revoked when the component unmounts, when
 * the attachment changes or when loading is switched off; nothing public
 * exists, and the request is aborted if it is no longer needed.
 */
export function useAuthenticatedBlob(
  conversationId: string,
  attachmentId: string,
  expectedTypePrefix: string,
  enabled: boolean,
) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);

  const key = `${conversationId}/${attachmentId}/${attempt}`;

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let objectUrl: string | null = null;

    fetchChatAttachmentBlob(conversationId, attachmentId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;

        // Whatever the server sent, only the expected kind is displayed.
        if (!blob.type.toLowerCase().startsWith(expectedTypePrefix)) {
          setSettled({
            key,
            error: { key: "chatAttachmentUnavailable", retryable: false },
          });
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setSettled({ key, url: objectUrl });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({ key, error: failureOf(error) });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversationId, attachmentId, expectedTypePrefix, enabled, key]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const current = enabled && settled?.key === key ? settled : null;

  const status: BlobStatus = !enabled
    ? "idle"
    : current?.url
      ? "ready"
      : current?.error
        ? "error"
        : "loading";

  return {
    status,
    url: current?.url ?? null,
    error: current?.error ?? null,
    retry,
  };
}
