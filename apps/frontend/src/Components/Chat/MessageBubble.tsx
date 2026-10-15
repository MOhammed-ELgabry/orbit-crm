import { FiAlertCircle, FiClock } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import type { PendingMessage } from "../../context/chatState";
import type { ChatMessage } from "../../types/chat";
import { formatMessageTime } from "./chatFormat";
import ReceiptTicks from "./ReceiptTicks";

interface MessageBubbleProps {
  mine: boolean;
  /** Team chat, someone else's message: show who wrote it. */
  senderLabel?: string;
  /** A message the server persisted... */
  message?: ChatMessage;
  /** ...or one that is still being sent / failed to send. */
  pending?: PendingMessage;
  onRetry?: () => void;
  onDiscard?: () => void;
}

export default function MessageBubble(props: MessageBubbleProps) {
  const { t, i18n } = useTranslation();
  const { mine, senderLabel } = props;

  const source = props.message ?? props.pending;
  if (!source) return null;

  const { body, createdAt } = source;

  return (
    <li
      className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
      data-testid={props.message ? "message" : "pending-message"}
    >
      {senderLabel && (
        <span className="mb-0.5 px-1 text-[11px] font-semibold text-slate-500">
          {senderLabel}
        </span>
      )}

      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%] ${
          mine
            ? "rounded-ee-md bg-indigo-600 text-white"
            : "rounded-es-md bg-slate-100 text-slate-900"
        } ${props.pending?.status === "failed" ? "opacity-80 ring-2 ring-rose-300" : ""}`}
      >
        {/* Always rendered as TEXT (never HTML); direction follows the content. */}
        <p dir="auto" className="whitespace-pre-wrap break-words">
          {body}
        </p>

        <div
          className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${
            mine ? "text-indigo-200" : "text-slate-500"
          }`}
        >
          <time dateTime={createdAt}>
            {formatMessageTime(createdAt, i18n.language)}
          </time>

          {props.message && mine && <ReceiptTicks message={props.message} />}

          {props.pending?.status === "sending" && (
            <span
              role="img"
              aria-label={t("chatMessageSending")}
              title={t("chatMessageSending")}
              data-testid="message-sending"
            >
              <FiClock size={12} aria-hidden="true" />
            </span>
          )}
        </div>
      </div>

      {props.pending?.status === "failed" && (
        <div
          role="alert"
          className="mt-1 flex items-center gap-2 px-1 text-[11px] text-rose-600"
        >
          <FiAlertCircle size={12} aria-hidden="true" />
          <span>
            {props.pending.retryable
              ? t("chatMessageFailed")
              : t("chatMessageRejected")}
          </span>

          {props.pending.retryable && (
            <button
              type="button"
              onClick={props.onRetry}
              className="font-semibold underline"
            >
              {t("chatMessageRetry")}
            </button>
          )}

          <button
            type="button"
            onClick={props.onDiscard}
            className="font-semibold underline"
          >
            {t("chatMessageDiscard")}
          </button>
        </div>
      )}
    </li>
  );
}
