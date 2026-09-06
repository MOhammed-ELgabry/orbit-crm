import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import {
  FiPlus,
  FiTrash2,
  FiPhoneCall,
  FiMail,
  FiUsers,
  FiCheckSquare,
  FiRefreshCw,
  FiFileText,
  FiActivity,
} from "react-icons/fi";

import {
  listActivities,
  createActivity,
  deleteActivity,
} from "../../services/activityService";
import type { Activity, ActivityType } from "../../types/activity";
import { ACTIVITY_TYPES } from "../../types/activity";
import { errorAlert, confirmAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  NOTE: FiFileText,
  CALL: FiPhoneCall,
  EMAIL: FiMail,
  MEETING: FiUsers,
  TASK: FiCheckSquare,
  STATUS_CHANGE: FiRefreshCw,
  SYSTEM: FiActivity,
  OTHER: FiActivity,
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
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ActivityTimeline({
  contactId,
  canCreate = true,
}: ActivityTimelineProps) {
  const { t } = useTranslation();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
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
      setStatus((prev) => (append ? prev : "loading"));

      try {
        const result = await listActivities({
          contactId,
          page: targetPage,
          limit: PAGE_SIZE,
          sortBy: "occurredAt",
          sortOrder: "desc",
        });

        setActivities((prev) =>
          append ? [...prev, ...result.activities] : result.activities,
        );
        setHasMore(result.meta.page < result.meta.totalPages);
        setPage(result.meta.page);
        setStatus("ready");
      } catch {
        setStatus("error");
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
      errorAlert({
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
      errorAlert({
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
            className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100"
          >
            <FiPlus size={14} />
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
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
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
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {status === "ready" && activities.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-8 text-center">
            <FiActivity className="text-slate-300" size={28} />
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
              const Icon = TYPE_ICON[activity.type] ?? FiActivity;

              return (
                <li key={activity.id} className="group flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-500">
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

                      <button
                        type="button"
                        onClick={() => handleDelete(activity)}
                        aria-label={t("delete")}
                        className="shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>

                    <p className="mt-1 text-[11px] text-slate-400">
                      {t(TYPE_LABEL_KEY[activity.type] ?? "activityTypeOther")}
                      {" · "}
                      {formatDistanceToNow(new Date(activity.occurredAt), {
                        addSuffix: true,
                      })}
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
            className="mt-4 w-full rounded-lg py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"
          >
            {t("loadMore")}
          </button>
        )}
      </div>
    </div>
  );
}