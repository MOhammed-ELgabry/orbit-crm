import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import NotificationItem from "../../Components/Notification/NotificationItem";
import { useNotifications } from "../../hooks/useNotifications";
import { useOpenNotification } from "../../hooks/useOpenNotification";

export default function NotificationsPage() {
  const { t } = useTranslation();
  const {
    unreadCount,
    items,
    hasMore,
    isLoading,
    isLoadingMore,
    hasError,
    loadList,
    loadMore,
    markAllRead,
  } = useNotifications();

  const openNotification = useOpenNotification();

  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {unreadCount > 0
            ? t("notificationsUnreadSummary", { count: unreadCount })
            : t("notificationsAllCaughtUp")}
        </p>

        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={unreadCount === 0}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("notificationsMarkAllRead")}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        {isLoading && items.length === 0 ? (
          <p
            role="status"
            className="px-4 py-10 text-center text-sm text-slate-500"
          >
            {t("notificationsLoading")}
          </p>
        ) : hasError && items.length === 0 ? (
          <div
            role="alert"
            className="px-4 py-10 text-center text-sm text-slate-600"
          >
            <p>{t("notificationsLoadError")}</p>
            <button
              type="button"
              onClick={() => void loadList()}
              className="mt-3 rounded-lg bg-[#605BFF] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#514cf0]"
            >
              {t("notificationsRetry")}
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {t("notificationsEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onOpen={openNotification}
              />
            ))}
          </ul>
        )}
      </div>

      {hasError && items.length > 0 && (
        <p role="alert" className="text-center text-xs text-rose-600">
          {t("notificationsLoadError")}
        </p>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoadingMore ? t("notificationsLoading") : t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}