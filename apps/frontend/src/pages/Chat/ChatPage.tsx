import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import ConversationList from "../../Components/Chat/ConversationList";
import MessageThread from "../../Components/Chat/MessageThread";
import { useChat } from "../../hooks/useChat";
import { LuMessageSquare } from "react-icons/lu";

/**
 * /dashboard/chat — conversation list on one side, the open thread on the
 * other; on phones only one of the two is shown at a time. The open
 * conversation lives in the URL (`?c=<id>`) so the browser Back button
 * returns from a thread to the list. Which conversations exist, who is in
 * them and what is visible is decided entirely by the server.
 */
export default function ChatPage() {
  const { t } = useTranslation();
  const { state, store, conversations } = useChat();
  const [params, setParams] = useSearchParams();

  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);

  const requestedId = params.get("c");
  const activeId =
    requestedId && state.conversations[requestedId] ? requestedId : null;

  const select = (conversationId: string) => {
    setOpenFailed(false);
    setParams({ c: conversationId });
  };

  const openPerson = async (userId: string) => {
    setOpeningUserId(userId);
    setOpenFailed(false);

    try {
      const conversation = await store.openDirect(userId);
      setParams({ c: conversation.id });
    } catch {
      setOpenFailed(true);
    } finally {
      setOpeningUserId(null);
    }
  };

  if (state.phase === "unavailable") {
    return (
      <p
        role="status"
        className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-600"
      >
        {t("chatUnavailable")}
      </p>
    );
  }

  if (state.phase === "idle" || state.phase === "loading") {
    return (
      <p
        role="status"
        className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500"
      >
        {t("chatLoading")}
      </p>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-600"
      >
        <p>{t("chatLoadError")}</p>
        <button
          type="button"
          onClick={() => store.retryBootstrap()}
          className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
        >
          {t("chatRetry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <aside
        className={`min-h-0 w-full shrink-0 flex-col border-slate-100 md:flex md:w-80 md:border-e lg:w-96 ${
          activeId ? "hidden" : "flex"
        }`}
      >
        <ConversationList
          state={state}
          conversations={conversations}
          me={state.me}
          activeId={activeId}
          openingUserId={openingUserId}
          openFailed={openFailed}
          onSelectConversation={select}
          onOpenPerson={(userId) => void openPerson(userId)}
        />
      </aside>

      <div
        className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${
          activeId ? "flex" : "hidden"
        }`}
      >
        {activeId ? (
          <MessageThread
            key={activeId}
            conversationId={activeId}
            onBack={() => setParams({})}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-slate-500">
            <LuMessageSquare
              size={40}
              aria-hidden="true"
              className="text-slate-300"
            />
            <p className="text-sm">{t("chatSelectConversation")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
