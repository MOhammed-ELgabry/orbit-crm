import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiBell } from "react-icons/fi";

import NotificationItem from "./NotificationItem";
import { useNotifications } from "../../hooks/useNotifications";
import { useOpenNotification } from "../../hooks/useOpenNotification";

const PREVIEW_COUNT = 8;

/**
 * Header bell: unread badge + a small popover with the latest items.
 * Every failure is local to this component — if the notifications API is
 * down the rest of the header and dashboard keep working.
 */
export default function NotificationBell() {
  const { t } = useTranslation();
  const { unreadCount, items, isLoading, hasError, loadList, markAllRead } =
    useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setIsOpen(false), []);
  const openNotification = useOpenNotification(close);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close]);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) void loadList();
  };

  const badge = unreadCount > 99 ? "99+" : String(unreadCount);
  const preview = items.slice(0, PREVIEW_COUNT);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={
          unreadCount > 0
            ? t("notificationsBellLabelUnread", { count: unreadCount })
            : t("notificationsBellLabel")
        }
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        <FiBell size={20} aria-hidden="true" />

        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute end-1 top-1 flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-[18px] text-white"
          >
            {badge}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t("notificationsTitle")}
          className="fixed inset-x-3 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="font-nunito text-sm font-semibold text-slate-800">
              {t("notificationsTitle")}
            </h2>

            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
              className="text-xs font-semibold text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
            >
              {t("notificationsMarkAllRead")}
            </button>
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {isLoading && items.length === 0 ? (
              <p
                role="status"
                className="px-4 py-8 text-center text-sm text-slate-500"
              >
                {t("notificationsLoading")}
              </p>
            ) : hasError && items.length === 0 ? (
              <div
                role="alert"
                className="px-4 py-8 text-center text-sm text-slate-600"
              >
                <p>{t("notificationsLoadError")}</p>
                <button
                  type="button"
                  onClick={() => void loadList()}
                  className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
                >
                  {t("notificationsRetry")}
                </button>
              </div>
            ) : preview.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                {t("notificationsEmpty")}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {preview.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onOpen={openNotification}
                  />
                ))}
              </ul>
            )}
          </div>

          <Link
            to="/dashboard/notifications"
            onClick={close}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-indigo-600 hover:bg-slate-50"
          >
            {t("notificationsViewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}