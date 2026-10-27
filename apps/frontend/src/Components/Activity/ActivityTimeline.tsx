import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";

import {
  listActivities,
  createActivity,
  deleteActivity,
} from "../../services/activityService";
import type { Activity, ActivityType } from "../../types/activity";
import { ACTIVITY_TYPES } from "../../types/activity";
import { confirmAlert } from "../../lib/swal";
import { notifyError } from "../../lib/notify";
import { getErrorMessage } from "../../lib/errors";
import { NO_DATE, parseDate } from "../../lib/contact360";
import {
  LuActivity,
  LuFileText,
  LuMail,
  LuPhoneCall,
  LuPlus,
  LuRefreshCw,
  LuSquareCheck,
  LuTrash2,
  LuUsers,
} from "react-icons/lu";

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  NOTE: LuFileText,
  CALL: LuPhoneCall,
  EMAIL: LuMail,
  MEETING: LuUsers,
  TASK: LuSquareCheck,
  STATUS_CHANGE: LuRefreshCw,
  SYSTEM: LuActivity,
  OTHER: LuActivity,
};

const TYPE_LABEL_KEY: Record<string, string> = {
  NOTE: "activityTypeNote",
  CALL: "activityTypeCall",
  EMAIL: "activityTypeEmail",
  MEETING: "activityTypeMeeting",
  TASK: "activityTypeTask",
  STATUS_CHANGE: "activityTypeStatusChange",
  SYSTEM: "activityTypeSystem",
  OTHER: "activityTypeOther",
};

const PAGE_SIZE = 10;

interface ActivityTimelineProps {
  /** Omit for a global feed (e.g. the dashboard); pass to scope to one contact's timeline. */
  contactId?: string;
  /** Allow logging a new activity from this timeline. Defaults to true. */
  canCreate?: boolean;
  /** Show the per-row delete button. Defaults to true (existing behaviour). */
  canDelete?: boolean;
  /**
   * Optional deep link for a row (e.g. a deal lifecycle event -> its deal).
   * The caller decides, so permissions stay with the caller; rows for which
   * it returns null have no link. Needs a Router only when supplied.
   */
  linkFor?: (activity: Activity) => { to: string; label: string } | null;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ActivityTimeline({
  contactId,
  canCreate = true,
  canDelete = true,
  linkFor,
}: ActivityTimelineProps) {
  const { t } = useTranslation();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "forbidden"
  >("loading");
  // Identifies the most recent load. A response that finishes after a newer
  // load started (contact changed, Retry, "Load more" overlap) or after the
  // component unmounted is ignored instead of overwriting newer data.
  const latestLoad = useRef(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [type, setType] = useState<ActivityType>("NOTE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    toDatetimeLocalValue(new Date()),
  );

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      // The `await` before this setState is what keeps this call
      // async-first rather than synchronous-within-the-effect (see
      // react-hooks/set-state-in-effect) — functionally instant
      // either way, since it only defers by one microtask.
      await Promise.resolve();
      const loadId = ++latestLoad.current;
      setStatus((prev) => (append ? prev : "loading"));

      try {
        const result = await listActivities({
          contactId,
          page: targetPage,
          limit: PAGE_SIZE,
          sortBy: "occurredAt",
          sortOrder: "desc",
        });

        if (loadId !== latestLoad.current) return;

        setActivities((prev) =>
          append ? [...prev, ...result.activities] : result.activities,
        );
        setHasMore(result.meta.page < result.meta.totalPages);
        setPage(result.meta.page);
        setStatus("ready");
      } catch (error) {
        if (loadId !== latestLoad.current) return;

        setStatus(
          axios.isAxiosError(error) && error.response?.status === 403
            ? "forbidden"
            : "error",
        );
      }
    },
    [contactId],
  );

  // A local (non-memoized) function called from inside the effect,
  // rather than calling the hoisted `load` reference directly — see
  // react-hooks/set-state-in-effect. `load` itself stays available
  // for the retry/"load more" buttons below, which aren’t inside an
  // effect and don’t trigger that rule.
  useEffect(() => {
    const loadOnMount = async () => {
      await load(1, false);
    };
    loadOnMount();

    return () => {
      // Invalidate whatever is still in flight for the previous contact.
      latestLoad.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const resetForm = () => {
    setType("NOTE");
    setTitle("");
    setDescription("");
    setOccurredAt(toDatetimeLocalValue(new Date()));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!title.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await createActivity({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        occurredAt: new Date(occurredAt).toISOString(),
        contactId,
      });

      setActivities((prev) => [created, ...prev]);
      resetForm();
      setIsFormOpen(false);
    } catch (error) {
      notifyError({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (activity: Activity) => {
    const confirmed = await confirmAlert({
      title: t("confirmDeleteTitle"),
      text: t("confirmDeleteMessage"),
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    });

    if (!confirmed) {
      return;
    }

    const previous = activities;
    setActivities((prev) => prev.filter((a) => a.id !== activity.id));

    try {
      await deleteActivity(activity.id);
    } catch (error) {
      setActivities(previous);
      notifyError({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-nunito text-[15px] font-semibold text-slate-800">
          {t("activityTimelineTitle")}
        </h3>

        {canCreate && (
          <button
            type="button"
            onClick={() => setIsFormOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-100"
          >
            <LuPlus size={14} />
            {t("logActivity")}
          </button>
        )}
      </div>

      {isFormOpen && (
        <form
          onSubmit={handleCreate}
          className="mt-4 flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-semibold text-gray-700">
                {t("activityTypeLabel")}
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ActivityType)}
                className="h-[38px] w-full rounded-[10px] bg-white px-3 text-sm text-gray-700 outline-none ring-1 ring-slate-200"
              >
                {ACTIVITY_TYPES.map((activityType) => (
                  <option key={activityType} value={activityType}>
                    {t(TYPE_LABEL_KEY[activityType])}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-semibold text-gray-700">
                {t("activityTitleLabel")}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
                className="h-[38px] w-full rounded-[10px] bg-white px-3 text-sm text-gray-700 outline-none ring-1 ring-slate-200"
              />
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-semibold text-gray-700">
              {t("activityDescriptionLabel")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-[10px] bg-white px-3 py-2 text-sm text-gray-700 outline-none ring-1 ring-slate-200"
            />
          </div>

          <div className="flex flex-col gap-0.5 sm:w-[240px]">
            <label className="text-xs font-semibold text-gray-700">
              {t("activityDateLabel")}
            </label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="h-[38px] w-full rounded-[10px] bg-white px-3 text-sm text-gray-700 outline-none ring-1 ring-slate-200"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                resetForm();
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        {status === "loading" && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 shrink-0 rounded-full bg-slate-100" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 w-1/3 rounded bg-slate-100" />
                  <div className="h-2.5 w-2/3 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-slate-500">{t("somethingWentWrong")}</p>
            <button
              type="button"
              onClick={() => load(1, false)}
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {status === "forbidden" && (
          <div
            role="alert"
            className="flex flex-col items-center gap-1 py-8 text-center"
          >
            <p className="text-sm font-medium text-slate-600">
              {t("contact360NoAccessTitle")}
            </p>
            <p className="text-xs text-slate-400">
              {t("contact360NoAccessDescription")}
            </p>
          </div>
        )}

        {status === "ready" && activities.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-8 text-center">
            <LuActivity className="text-slate-300" size={28} />
            <p className="mt-1 text-sm font-medium text-slate-600">
              {t("noActivitiesYetTitle")}
            </p>
            <p className="text-xs text-slate-400">
              {t("noActivitiesYetDescription")}
            </p>
          </div>
        )}

        {status === "ready" && activities.length > 0 && (
          <ul className="space-y-4">
            {activities.map((activity) => {
              const Icon = TYPE_ICON[activity.type] ?? LuActivity;
              const link = linkFor?.(activity) ?? null;

              return (
                <li key={activity.id} className="group flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                    <Icon size={15} />
                  </div>

                  <div className="min-w-0 flex-1 border-b border-slate-50 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {activity.title}
                        </p>
                        {activity.description && (
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-500">
                            {activity.description}
                          </p>
                        )}
                      </div>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(activity)}
                          aria-label={t("delete")}
                          className="shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                        >
                          <LuTrash2 size={14} />
                        </button>
                      )}
                    </div>

                    {link && (
                      <Link
                        to={link.to}
                        className="mt-1 inline-block text-[11px] font-semibold text-brand-600 hover:underline"
                      >
                        {link.label}
                      </Link>
                    )}

                    <p className="mt-1 text-[11px] text-slate-400">
                      {t(TYPE_LABEL_KEY[activity.type] ?? "activityTypeOther")}
                      {" · "}
                      {/* An unparsable date shows a dash; date-fns would
                          otherwise throw and take the page down. */}
                      {parseDate(activity.occurredAt)
                        ? formatDistanceToNow(
                            parseDate(activity.occurredAt) as Date,
                            { addSuffix: true },
                          )
                        : NO_DATE}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {status === "ready" && hasMore && (
          <button
            type="button"
            onClick={() => load(page + 1, true)}
            className="mt-4 w-full rounded-lg py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50"
          >
            {t("loadMore")}
          </button>
        )}
      </div>
    </div>
  );
}
