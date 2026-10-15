import { useEffect, useLayoutEffect, useRef, type UIEvent } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronLeft } from "react-icons/fi";

import { EMPTY_THREAD, selectPresence } from "../../context/chatState";
import { useChat } from "../../hooks/useChat";
import ChatAvatar from "./ChatAvatar";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";
import PresenceLabel from "./PresenceLabel";

/** Distance from the bottom that still counts as "looking at the latest". */
const AT_BOTTOM_PX = 80;

interface MessageThreadProps {
  conversationId: string;
  onBack: () => void;
}

/**
 * One open conversation. Mount it with `key={conversationId}` so scroll
 * bookkeeping starts fresh per conversation. While mounted it tells the store
 * what the user can actually see (conversation + "scrolled to the latest"):
 * messages are acknowledged as read only when they are really in view.
 */
export default function MessageThread({
  conversationId,
  onBack,
}: MessageThreadProps) {
  const { t } = useTranslation();
  const { state, store } = useChat();

  const conversation = state.conversations[conversationId];
  const thread = state.threads[conversationId] ?? EMPTY_THREAD;
  const me = state.me;

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  /** scrollHeight before older messages were prepended (to keep position). */
  const restoreHeightRef = useRef<number | null>(null);

  useEffect(() => {
    void store.loadThread(conversationId);
    store.reportViewport(conversationId, true);

    return () => store.reportViewport(null, true);
  }, [store, conversationId]);

  const firstId = thread.messages[0]?.id;
  const lastId = thread.messages.at(-1)?.id;
  const pendingCount = thread.pending.length;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (restoreHeightRef.current !== null) {
      el.scrollTop += el.scrollHeight - restoreHeightRef.current;
      restoreHeightRef.current = null;
      return;
    }

    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [firstId, lastId, pendingCount, thread.status]);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_PX;

    if (atBottom !== atBottomRef.current) {
      atBottomRef.current = atBottom;
      store.reportViewport(conversationId, atBottom);
    }
  };

  const loadOlder = () => {
    restoreHeightRef.current = scrollRef.current?.scrollHeight ?? null;
    void store.loadOlder(conversationId);
  };

  const send = (body: string): boolean => {
    const outcome = store.sendMessage(conversationId, body);

    if (outcome.ok) {
      // Following your own message is expected, wherever you had scrolled.
      atBottomRef.current = true;
      store.reportViewport(conversationId, true);
    }

    return outcome.ok;
  };

  if (!conversation) return null;

  const isTeam = conversation.type === "TEAM";
  const peer = conversation.peer;
  const title = isTeam ? t("chatTeamName") : (peer?.name ?? "");

  const connectionNotice =
    state.connection === "connecting"
      ? t("chatConnecting")
      : state.connection === "reconnecting"
        ? t("chatReconnecting")
        : state.connection === "unavailable" || state.connection === "stopped"
          ? t("chatLiveUnavailable")
          : null;

  const isEmpty =
    thread.status === "ready" &&
    thread.messages.length === 0 &&
    thread.pending.length === 0;

  return (
    <section
      aria-label={title}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("chatBack")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"
        >
          <FiChevronLeft
            size={20}
            aria-hidden="true"
            className="rtl:rotate-180"
          />
        </button>

        <ChatAvatar
          id={isTeam ? conversation.id : (peer?.id ?? conversation.id)}
          name={title}
          group={isTeam}
          online={
            peer ? selectPresence(state, peer.id, peer).online : undefined
          }
        />

        <div className="min-w-0">
          <h2 className="truncate font-nunito text-sm font-bold text-slate-900">
            {title}
          </h2>
          <p className="truncate text-xs text-slate-500">
            {isTeam ? (
              t("chatTeamSubtitle")
            ) : peer ? (
              <PresenceLabel presence={selectPresence(state, peer.id, peer)} />
            ) : null}
          </p>
        </div>
      </header>

      {connectionNotice && (
        <p
          role="status"
          className="border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800"
        >
          {connectionNotice}
        </p>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto bg-white px-3 py-4 sm:px-4"
      >
        {thread.hasMore && (
          <div className="mb-3 text-center">
            <button
              type="button"
              onClick={loadOlder}
              disabled={thread.loadingOlder}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-indigo-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {thread.loadingOlder ? t("chatLoadingOlder") : t("chatLoadOlder")}
            </button>
          </div>
        )}

        {thread.status === "loading" && thread.messages.length === 0 && (
          <p role="status" className="py-10 text-center text-sm text-slate-500">
            {t("chatLoading")}
          </p>
        )}

        {thread.status === "error" && thread.messages.length === 0 && (
          <div
            role="alert"
            className="py-10 text-center text-sm text-slate-600"
          >
            <p>{t("chatThreadLoadError")}</p>
            <button
              type="button"
              onClick={() =>
                void store.loadThread(conversationId, { force: true })
              }
              className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
            >
              {t("chatRetry")}
            </button>
          </div>
        )}

        {isEmpty && (
          <p className="py-10 text-center text-sm text-slate-500">
            {t("chatNoMessagesYet")}
          </p>
        )}

        <ul
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={t("chatMessagesLog")}
          className="flex flex-col gap-2"
        >
          {thread.messages.map((message, index) => {
            const mine = message.senderId === me?.id;
            const previous = thread.messages[index - 1];
            const showSender =
              isTeam && !mine && previous?.senderId !== message.senderId;

            return (
              <MessageBubble
                key={message.id}
                mine={mine}
                message={message}
                senderLabel={showSender ? message.senderName : undefined}
              />
            );
          })}

          {thread.pending.map((pending) => (
            <MessageBubble
              key={pending.clientMessageId}
              mine
              pending={pending}
              onRetry={() =>
                store.retryMessage(conversationId, pending.clientMessageId)
              }
              onDiscard={() =>
                store.discardMessage(conversationId, pending.clientMessageId)
              }
            />
          ))}
        </ul>
      </div>

      <MessageComposer disabled={!conversation.canSend} onSend={send} />
    </section>
  );
}
