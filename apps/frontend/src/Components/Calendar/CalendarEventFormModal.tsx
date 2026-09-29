import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiX } from "react-icons/fi";

import type {
  CalendarEvent,
  CalendarEventStatus,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from "../../types/calendar";
import { CALENDAR_EVENT_STATUSES } from "../../types/calendar";
import { CALENDAR_STATUS_LABEL_KEY } from "./calendarMeta";
import {
  allDayInclusiveEndInputToIso,
  allDayStartInputToIso,
  datetimeLocalToIso,
  isoToAllDayInclusiveEndInput,
  isoToAllDayStartInput,
  toDatetimeLocalValue,
} from "./calendarDates";
import { listTeamMembers } from "../../services/userService";
import { listContacts } from "../../services/contactService";
import { listLeads } from "../../services/leadService";
import { listDeals } from "../../services/dealService";
import type { TeamMember } from "../../types/user";
import type { Contact } from "../../types/contact";
import type { Lead } from "../../types/lead";
import type { Deal } from "../../types/deal";
import { getErrorMessage } from "../../lib/errors";
import { errorAlert } from "../../lib/swal";

interface CalendarEventFormModalProps {
  /** Present for edit, absent for create. */
  event?: CalendarEvent;
  /** Prefills startAt/endAt for a create opened from a specific day/slot. */
  initialStartAt?: Date;
  onClose: () => void;
  onSubmit: (
    input: CreateCalendarEventInput | UpdateCalendarEventInput,
  ) => Promise<void>;
}

interface CalendarEventFormState {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  status: CalendarEventStatus;
  // Timed inputs (datetime-local values) and all-day inputs (date
  // values) are kept as separate fields so toggling allDay never loses
  // what the person already typed into the other pair.
  startAtLocal: string;
  endAtLocal: string;
  startDateOnly: string;
  endDateOnly: string;
  contactId: string;
  leadId: string;
  dealId: string;
  assignedToId: string;
}

function buildInitialState(
  event: CalendarEvent | undefined,
  initialStartAt: Date | undefined,
): CalendarEventFormState {
  if (event) {
    return {
      title: event.title,
      description: event.description ?? "",
      location: event.location ?? "",
      allDay: event.allDay,
      status: event.status,
      startAtLocal: toDatetimeLocalValue(new Date(event.startAt)),
      endAtLocal: toDatetimeLocalValue(new Date(event.endAt)),
      startDateOnly: isoToAllDayStartInput(event.startAt),
      endDateOnly: isoToAllDayInclusiveEndInput(event.endAt),
      contactId: event.contactId ?? "",
      leadId: event.leadId ?? "",
      dealId: event.dealId ?? "",
      assignedToId: event.assignedToId ?? "",
    };
  }

  const start = initialStartAt ?? new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    title: "",
    description: "",
    location: "",
    allDay: false,
    status: "scheduled",
    startAtLocal: toDatetimeLocalValue(start),
    endAtLocal: toDatetimeLocalValue(end),
    startDateOnly: toDatetimeLocalValue(start).slice(0, 10),
    endDateOnly: toDatetimeLocalValue(start).slice(0, 10),
    contactId: "",
    leadId: "",
    dealId: "",
    assignedToId: "",
  };
}

const inputClass =
  "h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none ring-1 ring-transparent focus:ring-blue-200";
const labelClass = "text-xs font-semibold text-gray-700";

export default function CalendarEventFormModal({
  event,
  initialStartAt,
  onClose,
  onSubmit,
}: CalendarEventFormModalProps) {
  const { t } = useTranslation();
  const isEdit = Boolean(event);

  const [form, setForm] = useState<CalendarEventFormState>(() =>
    buildInitialState(event, initialStartAt),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  // Populates the "assigned to" / "contact" / "lead" / "deal"
  // dropdowns — mirrors TaskFormModal exactly, needs no permission of
  // its own beyond being an authenticated tenant member.
  useEffect(() => {
    let cancelled = false;

    listTeamMembers({ page: 1, limit: 100 })
      .then((result) => {
        if (!cancelled) setMembers(result.members.filter((m) => m.isActive));
      })
      .catch(() => {
        // Non-fatal — the dropdown just falls back to "unassigned" only.
      });

    listContacts({ page: 1, limit: 100 })
      .then((result) => {
        if (!cancelled) setContacts(result.contacts);
      })
      .catch(() => {
        // Non-fatal — the dropdown just falls back to "none" only.
      });

    listLeads({ page: 1, limit: 100 })
      .then((result) => {
        if (!cancelled) setLeads(result.leads);
      })
      .catch(() => {
        // Non-fatal — the dropdown just falls back to "none" only.
      });

    listDeals({ page: 1, limit: 100 })
      .then((result) => {
        if (!cancelled) setDeals(result.deals);
      })
      .catch(() => {
        // Non-fatal — the dropdown just falls back to "none" only.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof CalendarEventFormState>(
    key: K,
    value: CalendarEventFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleAllDayToggle = (nextAllDay: boolean) => {
    // Keep the two representations in sync at the moment of toggling,
    // so switching back and forth doesn't drift.
    if (nextAllDay) {
      setForm((prev) => ({
        ...prev,
        allDay: true,
        startDateOnly: prev.startAtLocal.slice(0, 10),
        endDateOnly: prev.endAtLocal.slice(0, 10),
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        allDay: false,
        startAtLocal: `${prev.startDateOnly}T09:00`,
        endAtLocal: `${prev.endDateOnly}T10:00`,
      }));
    }
  };

  const handleSubmit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();

    if (!form.title.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const startAt = form.allDay
        ? allDayStartInputToIso(form.startDateOnly)
        : datetimeLocalToIso(form.startAtLocal);
      const endAt = form.allDay
        ? allDayInclusiveEndInputToIso(form.endDateOnly)
        : datetimeLocalToIso(form.endAtLocal);

      const cleaned: CreateCalendarEventInput | UpdateCalendarEventInput = {
        title: form.title.trim(),
        startAt,
        endAt,
        allDay: form.allDay,
      };

      if (isEdit) {
        (cleaned as UpdateCalendarEventInput).status = form.status;
      }

      if (isEdit) {
        // Edit mode: description/location and the 4 relationship-ish
        // fields are always sent explicitly — including `null` for a
        // cleared field/dropdown — so a clear is actually applied
        // server-side rather than silently left as-is. See
        // UpdateCalendarEventInput's doc comment (types/calendar.ts).
        (cleaned as UpdateCalendarEventInput).description =
          form.description.trim().length > 0 ? form.description.trim() : null;
        (cleaned as UpdateCalendarEventInput).location =
          form.location.trim().length > 0 ? form.location.trim() : null;
        (cleaned as UpdateCalendarEventInput).contactId =
          form.contactId.length > 0 ? form.contactId : null;
        (cleaned as UpdateCalendarEventInput).leadId =
          form.leadId.length > 0 ? form.leadId : null;
        (cleaned as UpdateCalendarEventInput).dealId =
          form.dealId.length > 0 ? form.dealId : null;
        (cleaned as UpdateCalendarEventInput).assignedToId =
          form.assignedToId.length > 0 ? form.assignedToId : null;
      } else {
        // Create mode: there is no old value to accidentally preserve,
        // so an empty optional field is simply omitted.
        if (form.description.trim().length > 0) {
          cleaned.description = form.description.trim();
        }
        if (form.location.trim().length > 0) {
          cleaned.location = form.location.trim();
        }
        if (form.contactId.length > 0) {
          cleaned.contactId = form.contactId;
        }
        if (form.leadId.length > 0) {
          cleaned.leadId = form.leadId;
        }
        if (form.dealId.length > 0) {
          cleaned.dealId = form.dealId;
        }
        if (form.assignedToId.length > 0) {
          cleaned.assignedToId = form.assignedToId;
        }
      }

      await onSubmit(cleaned);
      onClose();
    } catch (error) {
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-nunito text-base font-semibold text-slate-800">
            {t(isEdit ? "editCalendarEvent" : "addCalendarEvent")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <FiX size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5 sm:col-span-2">
              <label className={labelClass}>{t("calendarEventTitle")}</label>
              <input
                type="text"
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="calendar-all-day"
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => handleAllDayToggle(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label
                htmlFor="calendar-all-day"
                className="text-sm font-medium text-slate-700"
              >
                {t("calendarAllDay")}
              </label>
            </div>

            {form.allDay ? (
              <>
                <div className="flex flex-col gap-0.5">
                  <label className={labelClass}>{t("calendarStartDate")}</label>
                  <input
                    type="date"
                    required
                    value={form.startDateOnly}
                    onChange={(e) => set("startDateOnly", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className={labelClass}>{t("calendarEndDate")}</label>
                  <input
                    type="date"
                    required
                    min={form.startDateOnly || undefined}
                    value={form.endDateOnly}
                    onChange={(e) => set("endDateOnly", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-0.5">
                  <label className={labelClass}>{t("calendarStartAt")}</label>
                  <input
                    type="datetime-local"
                    required
                    value={form.startAtLocal}
                    onChange={(e) => set("startAtLocal", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className={labelClass}>{t("calendarEndAt")}</label>
                  <input
                    type="datetime-local"
                    required
                    value={form.endAtLocal}
                    onChange={(e) => set("endAtLocal", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {isEdit && (
              <div className="flex flex-col gap-0.5">
                <label className={labelClass}>{t("calendarStatus")}</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    set("status", e.target.value as CalendarEventStatus)
                  }
                  className={inputClass}
                >
                  {CALENDAR_EVENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(CALENDAR_STATUS_LABEL_KEY[status])}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("calendarLocation")}</label>
              <input
                type="text"
                maxLength={255}
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("assignedTo")}</label>
              <select
                value={form.assignedToId}
                onChange={(e) => set("assignedToId", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("unassigned")}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.firstName} {member.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("calendarContact")}</label>
              <select
                value={form.contactId}
                onChange={(e) => set("contactId", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("calendarNoneOption")}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.firstName} {contact.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("calendarLead")}</label>
              <select
                value={form.leadId}
                onChange={(e) => set("leadId", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("calendarNoneOption")}</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.firstName} {lead.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("calendarDeal")}</label>
              <select
                value={form.dealId}
                onChange={(e) => set("dealId", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("calendarNoneOption")}</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className={labelClass}>{t("calendarDescription")}</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="w-full resize-none rounded-[10px] bg-[#F7F7F8] px-3 py-2 text-sm text-gray-700 outline-none"
            />
          </div>

          <div className="mt-2 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !form.title.trim()}
              className="rounded-lg bg-[#605BFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#514cf0] disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}