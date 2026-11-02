import { useCallback, useEffect, useRef, useState } from "react";

import { checkAttachmentFile, failureOf } from "../lib/chatAttachments";
import {
  cancelChatAttachment,
  uploadChatAttachment,
} from "../services/chatService";
import type { ChatAttachment, ChatAttachmentConfig } from "../types/chat";

type EnabledConfig = Extract<ChatAttachmentConfig, { enabled: true }>;

export type AttachmentUploadState =
  | { phase: "idle" }
  | { phase: "uploading"; file: File; progress: number }
  | { phase: "ready"; file: File; attachment: ChatAttachment }
  | { phase: "failed"; file: File; messageKey: string; retryable: boolean }
  | { phase: "expired"; file: File };

/** An unsent attachment is treated as expired a little before the server does. */
const EXPIRY_MARGIN_MS = 10_000;

/**
 * One attachment being prepared for the composer of ONE conversation.
 *
 * Lifecycle: pick -> upload (progress) -> ready -> sent (`consume`) or
 * discarded (`cancel`). Nothing is left behind: cancelling an upload aborts
 * the request, cancelling/leaving with a ready attachment asks the server to
 * discard it, and an upload that finishes after it was cancelled is discarded
 * too. (If even that request cannot be made, the server's own expiry removes
 * the file.)
 */
export function useChatAttachmentUpload(
  conversationId: string,
  config: EnabledConfig | null,
) {
  const [state, setState] = useState<AttachmentUploadState>({ phase: "idle" });

  const stateRef = useRef(state);
  const controllerRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);

  const update = useCallback((next: AttachmentUploadState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const discardOnServer = useCallback(
    (attachmentId: string) => {
      void cancelChatAttachment(conversationId, attachmentId).catch(
        () => undefined,
      );
    },
    [conversationId],
  );

  const start = useCallback(
    (file: File) => {
      controllerRef.current?.abort();

      const controller = new AbortController();
      controllerRef.current = controller;
      runRef.current += 1;
      const run = runRef.current;

      update({ phase: "uploading", file, progress: 0 });

      uploadChatAttachment(conversationId, file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (run !== runRef.current) return;
          update({ phase: "uploading", file, progress });
        },
      })
        .then((result) => {
          if (run !== runRef.current || controller.signal.aborted) {
            // Cancelled while the last bytes were in flight.
            discardOnServer(result.attachment.id);
            return;
          }

          update({ phase: "ready", file, attachment: result.attachment });
        })
        .catch((error: unknown) => {
          if (run !== runRef.current || controller.signal.aborted) return;

          const failure = failureOf(error);
          update({
            phase: "failed",
            file,
            messageKey: failure.key,
            retryable: failure.retryable,
          });
        });
    },
    [conversationId, discardOnServer, update],
  );

  const select = useCallback(
    (file: File) => {
      const previous = stateRef.current;

      if (previous.phase === "ready") discardOnServer(previous.attachment.id);

      const check = checkAttachmentFile(file, config);

      if (!check.ok) {
        controllerRef.current?.abort();
        runRef.current += 1;
        update({
          phase: "failed",
          file,
          retryable: false,
          messageKey:
            check.reason === "unsupported"
              ? "chatAttachmentErrUnsupported"
              : check.reason === "empty"
                ? "chatAttachmentErrEmpty"
                : "chatAttachmentErrTooLarge",
        });
        return;
      }

      start(file);
    },
    [config, discardOnServer, start, update],
  );

  /** Tries the same file again (failed with a retryable error, or expired). */
  const retry = useCallback(() => {
    const current = stateRef.current;

    if (
      current.phase === "expired" ||
      (current.phase === "failed" && current.retryable)
    ) {
      start(current.file);
    }
  }, [start]);

  /** The user removes the attachment before sending. */
  const cancel = useCallback(() => {
    const current = stateRef.current;

    controllerRef.current?.abort();
    runRef.current += 1;

    if (current.phase === "ready") discardOnServer(current.attachment.id);

    update({ phase: "idle" });
  }, [discardOnServer, update]);

  /** The message carrying the attachment was accepted: it is no longer ours. */
  const consume = useCallback(() => {
    controllerRef.current = null;
    runRef.current += 1;
    update({ phase: "idle" });
  }, [update]);

  // A ready attachment stops being sendable shortly before the server drops it.
  const readyAttachmentId =
    state.phase === "ready" ? state.attachment.id : null;
  const readyTtlMs = config?.readyTtlMs ?? null;

  useEffect(() => {
    if (!readyAttachmentId || readyTtlMs === null) return;

    const timer = setTimeout(
      () => {
        const current = stateRef.current;

        if (
          current.phase === "ready" &&
          current.attachment.id === readyAttachmentId
        ) {
          update({ phase: "expired", file: current.file });
        }
      },
      Math.max(0, readyTtlMs - EXPIRY_MARGIN_MS),
    );

    return () => clearTimeout(timer);
  }, [readyAttachmentId, readyTtlMs, update]);

  // Leaving the conversation / unmounting with an unsent attachment.
  useEffect(
    () => () => {
      const current = stateRef.current;

      controllerRef.current?.abort();
      runRef.current += 1;

      if (current.phase === "ready") {
        void cancelChatAttachment(conversationId, current.attachment.id).catch(
          () => undefined,
        );
      }
    },
    [conversationId],
  );

  return { state, select, retry, cancel, consume };
}
