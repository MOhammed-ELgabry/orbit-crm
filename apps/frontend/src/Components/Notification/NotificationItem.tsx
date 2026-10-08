import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import {
  FiAlertCircle,
  FiBriefcase,
  FiCalendar,
  FiCheckSquare,
  FiUser,
} from "react-icons/fi";

import type { AppNotification } from "../../types/notification";

function TypeIcon({ type }: { type: string }) {
  if (type.startsWith("task.")) return <FiCheckSquare size={15} />;
  if (type.startsWith("deal.")) return <FiBriefcase size={15} />;
  if (type.startsWith("lead.")) return <FiUser size={15} />;
  if (type.startsWith("calendar.")) return <FiCalendar size={15} />;
  return <FiAlertCircle size={15} />;
}

interface NotificationItemProps {
  notification: AppNotification;
  /** Called when the row is activated (click / Enter / Space). */
  onOpen: (notification: AppNotification) => void;
}

export default function NotificationItem({
  notification,
  onOpen,
}: NotificationItemProps) {
  const { t, i18n } = useTranslation();

  const isUnread = notification.readAt === null;

  const created = new Date(notification.createdAt);
  const when = Number.isNaN(created.getTime())
    ? ""
    : formatDistanceToNow(created, {
        addSuffix: true,
        locale: i18n.language === "ar" ? ar : enUS,
      });

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className={`flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${
          isUnread ? "bg-indigo-50/50" : ""
        }`}
      >
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isUnread
              ? "bg-indigo-100 text-indigo-600"
              : "bg-slate-100 text-slate-500"
          }`}
          aria-hidden="true"
        >
          <TypeIcon type={notification.type} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={`truncate text-sm ${
                isUnread
                  ? "font-semibold text-slate-900"
                  : "font-medium text-slate-700"
              }`}
            >
              {notification.title}
            </span>

            {isUnread && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-indigo-500"
                role="img"
                aria-label={t("notificationUnread")}
              />
            )}
          </span>

          {notification.body && (
            <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">
              {notification.body}
            </span>
          )}

          {when && (
            <span className="mt-1 block text-[11px] text-slate-400">
              {when}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}