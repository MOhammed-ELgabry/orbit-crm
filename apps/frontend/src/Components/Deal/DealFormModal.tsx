import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiX } from "react-icons/fi";

import type { CreateDealInput, Deal } from "../../types/deal";
import { DEAL_STAGES } from "../../types/deal";
import { DEAL_STAGE_LABEL_KEY } from "./dealStage";
import { listTeamMembers } from "../../services/userService";
import { listContacts } from "../../services/contactService";
import { listLeads } from "../../services/leadService";
import type { TeamMember } from "../../types/user";
import type { Contact } from "../../types/contact";
import type { Lead } from "../../types/lead";
import { getErrorMessage } from "../../lib/errors";
import { errorAlert } from "../../lib/swal";

interface DealFormModalProps {
  /** Present for edit, absent for create. */
  deal?: Deal;
  onClose: () => void;
  onSubmit: (input: CreateDealInput) => Promise<void>;
}

interface DealFormState {
  title: string;
  amount: string;
  stage: CreateDealInput["stage"];
  notes: string;
  expectedCloseDate: string;
  contactId: string;
  leadId: string;
  assignedToId: string;
}

const emptyForm: DealFormState = {
  title: "",
  amount: "",
  stage: "new",
  notes: "",
  expectedCloseDate: "",
  contactId: "",
  leadId: "",
  assignedToId: "",
};

const inputClass =
  "h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none ring-1 ring-transparent focus:ring-blue-200";
const labelClass = "text-xs font-semibold text-gray-700";

export default function DealFormModal({
  deal,
  onClose,
  onSubmit,
}: DealFormModalProps) {
  const { t } = useTranslation();
  const isEdit = Boolean(deal);

  const [form, setForm] = useState<DealFormState>(
    deal
      ? {
          title: deal.title,
          amount: deal.amount,
          stage: deal.stage,
          notes: deal.notes ?? "",
          expectedCloseDate: deal.expectedCloseDate
            ? deal.expectedCloseDate.slice(0, 10)
            : "",
          contactId: deal.contactId ?? "",
          leadId: deal.leadId ?? "",
          assignedToId: deal.assignedToId ?? "",
        }
      : emptyForm,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  // Populates the "assigned to" / "contact" / "lead" dropdowns. Any
  // authenticated tenant member can already list team members/contacts/
  // leads (see UsersPage/ContactsPage/LeadsPage), so this needs no extra
  // permission of its own.
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

    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof DealFormState>(
    key: K,
    value: DealFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.title.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const cleaned: CreateDealInput = {
        title: form.title.trim(),
        stage: form.stage,
      };

      if (form.amount.trim().length > 0) {
        cleaned.amount = Number(form.amount);
      }
      if (form.notes.trim().length > 0) {
        cleaned.notes = form.notes.trim();
      }
      if (form.expectedCloseDate.length > 0) {
        cleaned.expectedCloseDate = form.expectedCloseDate;
      }
      if (form.contactId.length > 0) {
        cleaned.contactId = form.contactId;
      }
      if (form.leadId.length > 0) {
        cleaned.leadId = form.leadId;
      }
      if (form.assignedToId.length > 0) {
        cleaned.assignedToId = form.assignedToId;
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
            {t(isEdit ? "editDeal" : "addDeal")}
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
              <label className={labelClass}>{t("dealTitle")}</label>
              <input
                type="text"
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("dealAmount")}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("dealStage")}</label>
              <select
                value={form.stage}
                onChange={(e) =>
                  set("stage", e.target.value as DealFormState["stage"])
                }
                className={inputClass}
              >
                {DEAL_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {t(DEAL_STAGE_LABEL_KEY[stage])}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("dealExpectedCloseDate")}</label>
              <input
                type="date"
                value={form.expectedCloseDate}
                onChange={(e) => set("expectedCloseDate", e.target.value)}
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
              <label className={labelClass}>{t("dealContact")}</label>
              <select
                value={form.contactId}
                onChange={(e) => set("contactId", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("dealNoneOption")}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.firstName} {contact.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("dealLead")}</label>
              <select
                value={form.leadId}
                onChange={(e) => set("leadId", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("dealNoneOption")}</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.firstName} {lead.lastName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className={labelClass}>{t("notes")}</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
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