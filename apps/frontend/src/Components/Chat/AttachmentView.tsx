import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuDownload, LuFileText, LuImageOff, LuLoader } from "react-icons/lu";

import { useAuthenticatedBlob } from "../../hooks/useAuthenticatedBlob";
import { failureOf, formatBytes } from "../../lib/chatAttachments";
import { fetchChatAttachmentBlob } from "../../services/chatService";
import type { ChatAttachment } from "../../types/chat";

interface AttachmentViewProps {
  conversationId: string;
  attachment: ChatAttachment;
  /** Own message (the bubble is coloured): only affects the contrast. */
  mine: boolean;
}

/** Revoke the temporary URL of a download shortly after the click. */
const DOWNLOAD_URL_LIFETIME_MS = 30_000;

/** True once the element is (about to be) visible; true at once without IO. */
function useNearViewport(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const el = ref.current;

    if (visible || !el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, visible]);

  return visible;
}

/**
 * An attachment inside a message.
 *  - Images: fetched through the authenticated endpoint when they come into
 *    view and shown as a thumbnail (click to enlarge). No public URL.
 *  - PDFs: never previewed or embedded; a download button fetches the file
 *    through the same authenticated endpoint and saves it.
 * Nothing about the file is rendered as HTML.
 */
export default function AttachmentView({
  conversationId,
  attachment,
  mine,
}: AttachmentViewProps) {
  return attachment.kind === "IMAGE" ? (
    <ImageAttachment
      conversationId={conversationId}
      attachment={attachment}
      mine={mine}
    />
  ) : (
    <PdfAttachment
      conversationId={conversationId}
      attachment={attachment}
      mine={mine}
    />
  );
}

function ImageAttachment({ conversationId, attachment }: AttachmentViewProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const near = useNearViewport(frameRef);
  const [expanded, setExpanded] = useState(false);

  const blob = useAuthenticatedBlob(
    conversationId,
    attachment.id,
    "image/",
    near,
  );

  const label = `${attachment.displayName} (${formatBytes(attachment.sizeBytes)})`;
  const ratio =
    attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : "4 / 3";

  return (
    <div ref={frameRef} data-testid="attachment-image">
      {blob.status === "ready" && blob.url ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={t(
            expanded ? "chatAttachmentShrink" : "chatAttachmentEnlarge",
            { name: attachment.displayName },
          )}
          aria-expanded={expanded}
          className="block max-w-full overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        >
          <img
            src={blob.url}
            alt={attachment.displayName}
            width={attachment.width ?? undefined}
            height={attachment.height ?? undefined}
            decoding="async"
            className={`block h-auto max-w-full object-contain ${
              expanded ? "max-h-[70vh]" : "max-h-60"
            }`}
          />
        </button>
      ) : blob.status === "error" ? (
        <div
          role="alert"
          className="flex min-h-20 min-w-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-current/30 p-3 text-center text-xs"
        >
          <LuImageOff size={20} aria-hidden="true" />
          <span>{t(blob.error?.key ?? "chatAttachmentUnavailable")}</span>
          {blob.error?.retryable && (
            <button
              type="button"
              onClick={blob.retry}
              className="font-semibold underline"
            >
              {t("chatRetry")}
            </button>
          )}
        </div>
      ) : (
        <div
          role="status"
          aria-label={t("chatAttachmentLoading", {
            name: attachment.displayName,
          })}
          style={{ aspectRatio: ratio }}
          className="flex max-h-60 min-h-20 w-52 max-w-full items-center justify-center rounded-xl bg-black/5"
        >
          <LuLoader size={18} className="animate-spin" aria-hidden="true" />
        </div>
      )}

      <p className="mt-1 truncate text-[11px] opacity-80" dir="auto">
        {label}
      </p>
    </div>
  );
}

function PdfAttachment({
  conversationId,
  attachment,
  mine,
}: AttachmentViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "downloading" }
    | { phase: "failed"; key: string }
  >({ phase: "idle" });

  const download = async () => {
    setState({ phase: "downloading" });

    try {
      const blob = await fetchChatAttachmentBlob(conversationId, attachment.id);

      // A fresh Blob with the PDF type: the file is saved, never displayed.
      const url = URL.createObjectURL(
        new Blob([blob], { type: "application/pdf" }),
      );
      const link = document.createElement("a");

      link.href = url;
      link.download = attachment.displayName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
      setState({ phase: "idle" });
    } catch (error) {
      setState({ phase: "failed", key: failureOf(error).key });
    }
  };

  const busy = state.phase === "downloading";

  return (
    <div data-testid="attachment-pdf">
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        aria-label={t("chatAttachmentDownload", {
          name: attachment.displayName,
        })}
        className={`flex w-full min-w-48 max-w-72 items-center gap-3 rounded-xl border px-3 py-2 text-start transition-colors disabled:cursor-wait ${
          mine
            ? "border-white/30 hover:bg-white/10"
            : "border-slate-300 hover:bg-slate-200/60"
        }`}
      >
        <LuFileText size={22} aria-hidden="true" className="shrink-0" />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold" dir="auto">
            {attachment.displayName}
          </span>
          <span className="block text-[11px] opacity-80">
            PDF · {formatBytes(attachment.sizeBytes)}
          </span>
        </span>

        {busy ? (
          <LuLoader size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <LuDownload size={16} aria-hidden="true" />
        )}
      </button>

      {state.phase === "failed" && (
        <p role="alert" className="mt-1 text-[11px] font-semibold">
          {t(state.key)}
        </p>
      )}
    </div>
  );
}
