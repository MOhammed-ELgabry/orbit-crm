import { FiCheck } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import { receiptStateOf } from "../../context/chatState";
import type { ChatMessage } from "../../types/chat";

/**
 * One check: the server persisted the message. Two checks: at least one
 * recipient acknowledged seeing it (emphasised once all of them did).
 */
export default function ReceiptTicks({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const state = receiptStateOf(message);
  const receipt = message.receipt;

  const label =
    state === "sent"
      ? t("chatReceiptSent")
      : state === "read"
        ? t("chatReceiptSeen")
        : t("chatReceiptSeenBy", {
            read: receipt?.readCount ?? 0,
            total: receipt?.recipientCount ?? 0,
          });

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="receipt"
      data-state={state}
      className={`inline-flex items-center ${
        state === "read" ? "text-sky-200" : "text-indigo-200"
      }`}
    >
      <FiCheck size={13} aria-hidden="true" />
      {state !== "sent" && (
        <FiCheck size={13} aria-hidden="true" className="-ms-2" />
      )}
    </span>
  );
}
