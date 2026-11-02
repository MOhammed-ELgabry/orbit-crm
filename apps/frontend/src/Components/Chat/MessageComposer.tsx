import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { useChatAttachmentConfig } from "../../hooks/useChatAttachmentConfig";
import { useChatAttachmentUpload } from "../../hooks/useChatAttachmentUpload";
import { ATTACHMENT_ACCEPT, formatBytes } from "../../lib/chatAttachments";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatAttachment } from "../../types/chat";
import {
  LuFileText,
  LuImage,
  LuLoader,
  LuPaperclip,
  LuRotateCw,
  LuSend,
  LuX,
} from "react-icons/lu";

const COUNTER_THRESHOLD = 500;
const MAX_HEIGHT_PX = 128;

interface MessageComposerProps {
  disabled?: boolean;
  /**
   * Returns true when the message was accepted (the box is then cleared).
   * `attachment` is present only when a ready attachment goes with it.
   */
  onSend: (body: string, attachment?: ChatAttachment) => boolean;
  /** The open conversation; attachments are uploaded into it. */
  conversationId?: string;
  /** Attachments are offered in direct conversations only. */
  attachmentsAllowed?: boolean;
}

/**
 * Enter sends, Shift+Enter inserts a newline, and Enter during IME
 * composition (Arabic/CJK input) is left alone. Plain text only.
 */
export default function MessageComposer({
  disabled = false,
  onSend,
  conversationId = "",
  attachmentsAllowed = false,
}: MessageComposerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The attach button exists only when the server says attachments are
  // available for this account (a hint; the server checks again on upload
  // and on send).
  const attachmentConfig = useChatAttachmentConfig(
    attachmentsAllowed && !disabled && conversationId !== "",
  );
  const upload = useChatAttachmentUpload(conversationId, attachmentConfig);
  const uploadState = upload.state;

  const readyAttachment =
    uploadState.phase === "ready" ? uploadState.attachment : undefined;

  // A pending / failed / expired attachment blocks sending: the message must
  // never go out without the file the user chose (or silently drop it).
  const attachmentBlocksSend =
    uploadState.phase === "uploading" ||
    uploadState.phase === "failed" ||
    uploadState.phase === "expired";

  const hasContent = value.trim().length > 0 || readyAttachment !== undefined;
  const canSubmit = !disabled && hasContent && !attachmentBlocksSend;
  const remaining = CHAT_MESSAGE_MAX_LENGTH - value.length;

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    // Allows choosing the same file again after removing it.
    event.target.value = "";

    if (file) upload.select(file);
  };

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const submit = () => {
    if (!canSubmit) return;

    if (onSend(value, readyAttachment)) {
      setValue("");
      // The attachment now belongs to the sent message.
      if (readyAttachment) upload.consume();
      requestAnimationFrame(resize);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    submit();
  };

  if (disabled) {
    return (
      <p
        role="status"
        className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500"
      >
        {t("chatCannotSend")}
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="border-t border-slate-100 bg-white p-3"
    >
      {uploadState.phase !== "idle" && (
        <AttachmentChip
          state={uploadState}
          onRetry={upload.retry}
          onRemove={upload.cancel}
        />
      )}

      <div className="flex items-end gap-2">
        {attachmentConfig && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              onChange={onFileChosen}
              className="hidden"
              tabIndex={-1}
              data-testid="attachment-input"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadState.phase === "uploading"}
              aria-label={t("chatAttachFile")}
              title={t("chatAttachFile")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <LuPaperclip size={18} aria-hidden="true" />
            </button>
          </>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          dir="auto"
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          aria-label={t("chatComposerLabel")}
          placeholder={t("chatComposerPlaceholder")}
          onChange={(event) => {
            setValue(event.target.value);
            resize();
          }}
          onKeyDown={onKeyDown}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none"
        />

        <button
          type="submit"
          disabled={!canSubmit}
          aria-label={t("chatSend")}
          title={t("chatSend")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          <LuSend size={17} aria-hidden="true" className="rtl:-scale-x-100" />
        </button>
      </div>

      {attachmentBlocksSend && (
        <p role="status" className="mt-1 text-[11px] text-slate-500">
          {uploadState.phase === "uploading"
            ? t("chatAttachmentWaitUpload")
            : t("chatAttachmentFixFirst")}
        </p>
      )}

      {remaining <= COUNTER_THRESHOLD && (
        <p
          className={`mt-1 text-end text-[11px] ${
            remaining <= 0 ? "text-rose-600" : "text-slate-500"
          }`}
        >
          {t("chatCharsLeft", { count: Math.max(0, remaining) })}
        </p>
      )}
    </form>
  );
}

interface AttachmentChipProps {
  state: Exclude<
    ReturnType<typeof useChatAttachmentUpload>["state"],
    { phase: "idle" }
  >;
  onRetry: () => void;
  onRemove: () => void;
}

/** The chosen file: name, size, progress / result, retry and remove. */
function AttachmentChip({ state, onRetry, onRemove }: AttachmentChipProps) {
  const { t } = useTranslation();

  const name =
    state.phase === "ready" ? state.attachment.displayName : state.file.name;
  const size =
    state.phase === "ready" ? state.attachment.sizeBytes : state.file.size;
  const isPdf =
    state.phase === "ready"
      ? state.attachment.kind === "PDF"
      : state.file.type === "application/pdf" ||
        state.file.name.toLowerCase().endsWith(".pdf");

  const failed = state.phase === "failed" || state.phase === "expired";
  const canRetry =
    state.phase === "expired" || (state.phase === "failed" && state.retryable);

  const percent =
    state.phase === "uploading" ? Math.round(state.progress * 100) : 0;

  const statusText =
    state.phase === "uploading"
      ? t("chatAttachmentUploading", { percent })
      : state.phase === "ready"
        ? t("chatAttachmentReady")
        : state.phase === "expired"
          ? t("chatAttachmentErrExpired")
          : t(state.messageKey);

  return (
    <div
      className={`mb-2 flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
        failed
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
      data-testid="attachment-chip"
    >
      <span className="shrink-0" aria-hidden="true">
        {isPdf ? <LuFileText size={20} /> : <LuImage size={20} />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold" dir="auto">
          {name}
          <span className="ms-2 text-[11px] font-normal opacity-70">
            {formatBytes(size)}
          </span>
        </p>

        {state.phase === "uploading" && (
          <div
            role="progressbar"
            aria-label={t("chatAttachmentUploadingLabel", { name })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}

        <p role={failed ? "alert" : "status"} className="mt-0.5 text-[11px]">
          {statusText}
        </p>
      </div>

      {state.phase === "uploading" && (
        <LuLoader
          size={16}
          className="shrink-0 animate-spin"
          aria-hidden="true"
        />
      )}

      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          aria-label={t("chatAttachmentRetry")}
          title={t("chatAttachmentRetry")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-rose-100"
        >
          <LuRotateCw size={16} aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label={t("chatAttachmentRemove")}
        title={t("chatAttachmentRemove")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-slate-200"
      >
        <LuX size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
