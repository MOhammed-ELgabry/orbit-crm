import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { selectPresence, type ChatState } from "../../context/chatState";
import type { ChatConversation, ChatMe } from "../../types/chat";
import ChatAvatar from "./ChatAvatar";
import { formatMessageTime } from "./chatFormat";
import PresenceLabel from "./PresenceLabel";
import { LuSearch } from "react-icons/lu";

type Tab = "chats" | "people";

interface ConversationListProps {
  state: ChatState;
  conversations: ChatConversation[];
  me: ChatMe | null;
  activeId: string | null;
  openingUserId: string | null;
  openFailed: boolean;
  onSelectConversation: (conversationId: string) => void;
  onOpenPerson: (userId: string) => void;
}

export default function ConversationList({
  state,
  conversations,
  me,
  activeId,
  openingUserId,
  openFailed,
  onSelectConversation,
  onOpenPerson,
}: ConversationListProps) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("chats");
  const [query, setQuery] = useState("");
  const searchId = useId();

  const needle = query.trim().toLowerCase();

  const visibleConversations = useMemo(
    () =>
      conversations.filter((conversation) => {
        if (!needle) return true;

        const name =
          conversation.type === "TEAM"
            ? t("chatTeamName")
            : (conversation.peer?.name ?? "");

        return name.toLowerCase().includes(needle);
      }),
    [conversations, needle, t],
  );

  const visiblePeople = useMemo(
    () =>
      state.teammates.filter(
        (teammate) =>
          teammate.id !== me?.id &&
          (!needle || teammate.name.toLowerCase().includes(needle)),
      ),
    [state.teammates, me?.id, needle],
  );

  const tabClass = (value: Tab) =>
    `flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      tab === value
        ? "bg-white text-brand-700 shadow-sm"
        : "text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-slate-100 p-3">
        <div
          role="tablist"
          aria-label={t("chatTitle")}
          className="flex gap-1 rounded-xl bg-slate-100 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "chats"}
            onClick={() => setTab("chats")}
            className={tabClass("chats")}
          >
            {t("chatTabChats")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "people"}
            onClick={() => setTab("people")}
            className={tabClass("people")}
          >
            {t("chatTabPeople")}
          </button>
        </div>

        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {t("chatSearchLabel")}
          </label>
          <LuSearch
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            maxLength={80}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("chatSearchPlaceholder")}
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-3 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none"
          />
        </div>

        {openFailed && (
          <p role="alert" className="text-xs text-rose-600">
            {t("chatOpenFailed")}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "chats" ? (
          visibleConversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              {needle ? t("chatNoResults") : t("chatNoConversations")}
            </p>
          ) : (
            <ul
              aria-label={t("chatConversationsList")}
              className="divide-y divide-slate-100"
            >
              {visibleConversations.map((conversation) => {
                const isTeam = conversation.type === "TEAM";
                const peer = conversation.peer;
                const name = isTeam ? t("chatTeamName") : (peer?.name ?? "");
                const last = conversation.lastMessage;
                const active = conversation.id === activeId;

                const preview = last
                  ? last.senderId === me?.id
                    ? `${t("chatYou")}: ${last.body}`
                    : isTeam
                      ? `${last.senderName}: ${last.body}`
                      : last.body
                  : "";

                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => onSelectConversation(conversation.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${
                        active ? "bg-brand-50/60" : ""
                      }`}
                    >
                      <ChatAvatar
                        id={
                          isTeam
                            ? conversation.id
                            : (peer?.id ?? conversation.id)
                        }
                        name={name}
                        group={isTeam}
                        online={
                          peer
                            ? selectPresence(state, peer.id, peer).online
                            : undefined
                        }
                      />

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">
                            {name}
                          </span>
                          {last && (
                            <time
                              dateTime={last.createdAt}
                              className="shrink-0 text-[10px] text-slate-400"
                            >
                              {formatMessageTime(last.createdAt, i18n.language)}
                            </time>
                          )}
                        </span>

                        <span className="flex items-center justify-between gap-2">
                          <span
                            dir="auto"
                            className="truncate text-xs text-slate-500"
                          >
                            {preview}
                          </span>

                          {conversation.unreadCount > 0 && (
                            <span
                              data-testid="conversation-unread"
                              aria-label={t("chatUnreadBadge", {
                                count: conversation.unreadCount,
                              })}
                              className="flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold leading-[18px] text-white"
                            >
                              {conversation.unreadCount > 99
                                ? "99+"
                                : conversation.unreadCount}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : visiblePeople.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {needle ? t("chatNoResults") : t("chatNoPeople")}
          </p>
        ) : (
          <ul
            aria-label={t("chatPeopleList")}
            className="divide-y divide-slate-100"
          >
            {visiblePeople.map((teammate) => {
              const presence = selectPresence(state, teammate.id, teammate);

              return (
                <li key={teammate.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPerson(teammate.id)}
                    disabled={openingUserId !== null}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                  >
                    <ChatAvatar
                      id={teammate.id}
                      name={teammate.name}
                      online={presence.online}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {teammate.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {teammate.roleName ? `${teammate.roleName} · ` : ""}
                        <PresenceLabel presence={presence} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
