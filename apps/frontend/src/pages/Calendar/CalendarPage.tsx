import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { ar, enUS } from "date-fns/locale";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { FiCalendar, FiChevronLeft, FiChevronRight, FiList, FiPlus } from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import type {
  CalendarEvent,
  CalendarEventStatus,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "../../types/calendar";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from "../../services/calendarService";
import { listTeamMembers } from "../../services/userService";
import { listContacts } from "../../services/contactService";
import { listLeads } from "../../services/leadService";
import { listDeals } from "../../services/dealService";
import CalendarEventFormModal from "../../Components/Calendar/CalendarEventFormModal";
import CalendarMonthGrid from "../../Components/Calendar/CalendarMonthGrid";
import CalendarAgenda from "../../Components/Calendar/CalendarAgenda";
import { confirmAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import { trackEvent } from "../../lib/posthog";

type LoadStatus = "loading" | "ready" | "error" | "forbidden";
type ViewMode = "month" | "agenda";

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuth();
  const locale = i18n.language === "ar" ? ar : enUS;
  const isRtl = i18n.language === "ar";

  const canCreate = hasPermission("calendar:create");
  const canUpdate = hasPermission("calendar:update");
  const canDelete = hasPermission("calendar:delete");

  const [viewMode, setViewMode] = useState<ViewMode>("agenda");
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const [modalState, setModalState] = useState<"create" | CalendarEvent | null>(null);
  const [modalInitialStart, setModalInitialStart] = useState<Date | undefined>(undefined);

  // Only for display — resolving assignedToId/contactId/leadId/dealId
  // to a name in the agenda. Any authenticated tenant member can
  // already list all four (see TasksPage/TaskFormModal), so this
  // needs no permission of its own beyond being logged in.
  const [memberNameById, setMemberNameById] = useState<Record<string, string>>({});
  const [contactNameById, setContactNameById] = useState<Record<string, string>>({});
  const [leadNameById, setLeadNameById] = useState<Record<string, string>>({});
  const [dealNameById, setDealNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    listTeamMembers({ page: 1, limit: 100 })
      .then((result) => {
        const map: Record<string, string> = {};
        for (const member of result.members) {
          map[member.id] = `${member.firstName} ${member.lastName}`.trim();
        }
        setMemberNameById(map);
      })
      .catch(() => {
        // Non-fatal — names just fall back to the raw id being hidden.
      });

    listContacts({ page: 1, limit: 100 })
      .then((result) => {
        const map: Record<string, string> = {};
        for (const contact of result.contacts) {
          map[contact.id] = `${contact.firstName} ${contact.lastName}`.trim();
        }
        setContactNameById(map);
      })
      .catch(() => {
        // Non-fatal.
      });

    listLeads({ page: 1, limit: 100 })
      .then((result) => {
        const map: Record<string, string> = {};
        for (const lead of result.leads) {
          map[lead.id] = `${lead.firstName} ${lead.lastName}`.trim();
        }
        setLeadNameById(map);
      })
      .catch(() => {
        // Non-fatal.
      });

    listDeals({ page: 1, limit: 100 })
      .then((result) => {
        const map: Record<string, string> = {};
        for (const deal of result.deals) {
          map[deal.id] = deal.title;
        }
        setDealNameById(map);
      })
      .catch(() => {
        // Non-fatal.
      });
  }, []);

  // The full visible grid range — including the padding days from the
  // adjacent months the month grid also renders — so those padding
  // cells show their events too, not just the current month's own
  // days. Agenda uses this same range for simplicity (Phase 1 scope:
  // one shared month-at-a-time window for both views).
  const { rangeFrom, rangeTo } = useMemo(() => {
    const from = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
    const to = addDays(endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 0 }), 1);
    return { rangeFrom: from, rangeTo: to };
  }, [visibleMonth]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await listCalendarEvents({
        from: rangeFrom.toISOString(),
        to: rangeTo.toISOString(),
      });
      setEvents(result.events);
      setHasMore(result.meta.hasMore);
      setStatus("ready");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setStatus("forbidden");
      } else {
        setStatus("error");
      }
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateModal = (initialStart?: Date) => {
    setModalInitialStart(initialStart);
    setModalState("create");
  };

  const handleShowDay = (day: Date) => {
    // A day cell in the month grid switches to the agenda view rather
    // than opening a second, smaller calendar surface — "+N more"
    // (overflowing days) and an ordinary day click both land here.
    setViewMode("agenda");
    setVisibleMonth(startOfMonth(day));
  };

  const trackStatusOutcome = (previousStatus: CalendarEventStatus, updated: CalendarEvent) => {
    if (updated.status === previousStatus) return;
    if (updated.status === "completed") {
      trackEvent("calendar_event_completed", { status: updated.status, all_day: updated.allDay });
    } else if (updated.status === "cancelled") {
      trackEvent("calendar_event_cancelled", { status: updated.status, all_day: updated.allDay });
    }
  };

  const handleCreateOrUpdate = async (
    input: CreateCalendarEventInput | UpdateCalendarEventInput,
  ) => {
    if (modalState && modalState !== "create") {
      const previousStatus = modalState.status;
      // Safe: CalendarEventFormModal only ever builds an
      // UpdateCalendarEventInput-shaped object while editing (see its
      // submit handler) — the union is just so one component/prop
      // serves both modes.
      const updated = await updateCalendarEvent(
        modalState.id,
        input as UpdateCalendarEventInput,
      );
      trackEvent("calendar_event_updated", { status: updated.status, all_day: updated.allDay });
      trackStatusOutcome(previousStatus, updated);
      setEvents((prev) => prev.map((ev) => (ev.id === updated.id ? updated : ev)));
    } else {
      const created = await createCalendarEvent(input as CreateCalendarEventInput);
      trackEvent("calendar_event_created", { status: created.status, all_day: created.allDay });
      setEvents((prev) => [...prev, created]);
    }
  };

  const handleSetStatus = async (
    event: CalendarEvent,
    nextStatus: "completed" | "cancelled" | "scheduled",
  ) => {
    const previous = events;
    setEvents((prev) =>
      prev.map((ev) => (ev.id === event.id ? { ...ev, status: nextStatus } : ev)),
    );

    try {
      const updated = await updateCalendarEvent(event.id, { status: nextStatus });
      trackEvent("calendar_event_updated", { status: updated.status, all_day: updated.allDay });
      trackStatusOutcome(event.status, updated);
      setEvents((prev) => prev.map((ev) => (ev.id === updated.id ? updated : ev)));
    } catch (error) {
      setEvents(previous);
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    }
  };

  const handleDelete = async (event: CalendarEvent) => {
    const confirmed = await confirmAlert({
      title: t("confirmDeleteTitle"),
      text: t("deleteCalendarEventConfirm"),
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    });
    if (!confirmed) return;

    const previous = events;
    setEvents((prev) => prev.filter((ev) => ev.id !== event.id));

    try {
      await deleteCalendarEvent(event.id);
      trackEvent("calendar_event_deleted");
    } catch (error) {
      setEvents(previous);
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    }
  };

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibleMonth((prev) => subMonths(prev, 1))}
            aria-label={t("calendarPreviousMonth")}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            {isRtl ? <FiChevronRight size={18} /> : <FiChevronLeft size={18} />}
          </button>
          <h1 className="min-w-[10ch] font-nunito text-base font-semibold text-slate-800">
            {format(visibleMonth, "MMMM yyyy", { locale })}
          </h1>
          <button
            type="button"
            onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
            aria-label={t("calendarNextMonth")}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            {isRtl ? <FiChevronLeft size={18} /> : <FiChevronRight size={18} />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Month/Agenda toggle: hidden below sm, so mobile always
              shows the agenda default with no way to switch to the
              cramped grid. */}
          <div className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 sm:flex">
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                viewMode === "month" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              <FiCalendar size={14} />
              {t("calendarMonthView")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("agenda")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                viewMode === "agenda" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              <FiList size={14} />
              {t("calendarAgendaView")}
            </button>
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#605BFF] px-4 text-sm font-semibold text-white hover:bg-[#514cf0]"
            >
              <FiPlus size={16} />
              <span className="hidden sm:inline">{t("addCalendarEvent")}</span>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-5">
        {status === "loading" && (
          <div className="space-y-3 py-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-50" />
            ))}
          </div>
        )}

        {status === "forbidden" && (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="text-sm font-medium text-slate-600">{t("calendarNoAccessTitle")}</p>
            <p className="text-xs text-slate-400">{t("calendarNoAccessDescription")}</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="text-sm text-slate-500">{t("somethingWentWrong")}</p>
            <button
              type="button"
              onClick={() => load()}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
            {hasMore && (
              <p className="mb-2 text-center text-xs text-amber-600">
                {t("calendarShowingFirstResults")}
              </p>
            )}

            {/* Month grid: only ever rendered at sm+ (the toggle that
                selects it is itself hidden below sm), but the check is
                kept explicit here too rather than relying solely on
                the toggle being unreachable. */}
            <div className="hidden sm:block">
              {viewMode === "month" ? (
                <CalendarMonthGrid
                  visibleMonth={visibleMonth}
                  events={events}
                  onSelectEvent={(event) => setModalState(event)}
                  onShowDay={handleShowDay}
                />
              ) : (
                <CalendarAgenda
                  events={events}
                  memberNameById={memberNameById}
                  contactNameById={contactNameById}
                  leadNameById={leadNameById}
                  dealNameById={dealNameById}
                  canUpdate={canUpdate}
                  canDelete={canDelete}
                  onEdit={(event) => setModalState(event)}
                  onDelete={handleDelete}
                  onSetStatus={handleSetStatus}
                />
              )}
            </div>

            <div className="sm:hidden">
              <CalendarAgenda
                events={events}
                memberNameById={memberNameById}
                contactNameById={contactNameById}
                leadNameById={leadNameById}
                dealNameById={dealNameById}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onEdit={(event) => setModalState(event)}
                onDelete={handleDelete}
                onSetStatus={handleSetStatus}
              />
            </div>
          </>
        )}
      </div>

      {modalState && (
        <CalendarEventFormModal
          event={modalState === "create" ? undefined : modalState}
          initialStartAt={modalInitialStart}
          onClose={() => setModalState(null)}
          onSubmit={handleCreateOrUpdate}
        />
      )}
    </div>
  );
}