import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useChat } from "../../hooks/useChat";
import Hint from "../ui/Hint";
import { LuMessageSquare } from "react-icons/lu";

/**
 * Header entry point, placed next to the notification bell with the same
 * look. Hidden when the server says chat is not available for this account
 * (403); otherwise it never blocks the header: a failure only means no badge.
 */
export default function ChatButton() {
  const { t } = useTranslation();
  const { totalUnread, state } = useChat();

  if (state.phase === "unavailable") return null;

  const badge = totalUnread > 99 ? "99+" : String(totalUnread);

  return (
    <Hint id="chat" placement="bottom">
      <NavLink
        to="/dashboard/chat"
        aria-label={
          totalUnread > 0
            ? t("chatButtonLabelUnread", { count: totalUnread })
            : t("chatButtonLabel")
        }
        className={({ isActive }) =>
          `relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-500 ${
            isActive ? "bg-slate-100 text-brand-600" : ""
          }`
        }
      >
        <LuMessageSquare size={20} aria-hidden="true" />

        {totalUnread > 0 && (
          <span
            data-testid="chat-badge"
            className="absolute end-1 top-1 flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-[18px] text-white"
          >
            {badge}
          </span>
        )}
      </NavLink>
    </Hint>
  );
}
