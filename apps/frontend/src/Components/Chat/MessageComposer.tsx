import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { FiSend } from "react-icons/fi";

import { CHAT_MESSAGE_MAX_LENGTH } from "../../types/chat";

const COUNTER_THRESHOLD = 500;
const MAX_HEIGHT_PX = 128;

interface MessageComposerProps {
  disabled?: boolean;
  /** Returns true when the message was accepted (the box is then cleared). */
  onSend: (body: string) => boolean;
}

/**
 * Enter sends, Shift+Enter inserts a newline, and Enter during IME
 * composition (Arabic/CJK input) is left alone. Plain text only.
 */
export default function MessageComposer({
  disabled = false,
  onSend,
}: MessageComposerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = !disabled && value.trim().length > 0;
  const remaining = CHAT_MESSAGE_MAX_LENGTH - value.length;

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const submit = () => {
    if (!canSubmit) return;

    if (onSend(value)) {
      setValue("");
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
      <div className="flex items-end gap-2">
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
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
        />

        <button
          type="submit"
          disabled={!canSubmit}
          aria-label={t("chatSend")}
          title={t("chatSend")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          <FiSend size={17} aria-hidden="true" className="rtl:-scale-x-100" />
        </button>
      </div>

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
