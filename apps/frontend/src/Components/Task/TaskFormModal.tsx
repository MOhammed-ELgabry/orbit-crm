import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiX } from "react-icons/fi";

import type {
  CreateTaskInput,
  Task,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
} from "../../types/task";
import { TASK_PRIORITIES, TASK_STATUSES } from "../../types/task";
import { TASK_PRIORITY_LABEL_KEY, TASK_STATUS_LABEL_KEY } from "./taskMeta";
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

interface TaskFormModalProps {
  /** Present for edit, absent for create. */
  task?: Task;
  onClose: () => void;
  onSubmit: (input: CreateTaskInput | UpdateTaskInput) => Promise<void>;
}

interface TaskFormState {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  contactId: string;
  leadId: string;
  dealId: string;
  assignedToId: string;
}

const emptyForm: TaskFormState = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  dueDate: "",
  contactId: "",
  leadId: "",
  dealId: "",
  assignedToId: "",
};

const inputClass =
  "h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none ring-1 ring-transparent focus:ring-blue-200";
const labelClass = "text-xs font-semibold text-gray-700";

export default function TaskFormModal({
  task,
  onClose,
  onSubmit,
}: TaskFormModalProps) {
  const { t } = useTranslation();
  const isEdit = Boolean(task);

  const [form, setForm] = useState<TaskFormState>(
    task
      ? {
          title: task.title,
          description: task.description ?? "",
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
          contactId: task.contactId ?? "",
          leadId: task.leadId ?? "",
          dealId: task.dealId ?? "",
          assignedToId: task.assignedToId ?? "",
        }
      : emptyForm,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  // Populates the "assigned to" / "contact" / "lead" / "deal"
  // dropdowns. Any authenticated tenant member can already list team
  // members/contacts/leads/deals (see UsersPage/ContactsPage/LeadsPage/
  // DealsPage), so this needs no extra permission of its own — mirrors
  // DealFormModal exactly, with one more list for the deal picker.
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

  const set = <K extends keyof TaskFormState>(
    key: K,
    value: TaskFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.title.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const cleaned: CreateTaskInput | UpdateTaskInput = {
        title: form.title.trim(),
        status: form.status,
        priority: form.priority,
      };

      if (form.description.trim().length > 0) {
        cleaned.description = form.description.trim();
      }

      if (isEdit) {
        // Edit mode: the 4 relationship-ish fields are always sent
        // explicitly — including `null` for a cleared dropdown — so a
        // cleared relationship is actually cleared server-side rather
        // than silently left as-is. See UpdateTaskInput's doc comment
        // (types/task.ts) for why omitting them here would be a bug.
        (cleaned as UpdateTaskInput).dueDate =
          form.dueDate.length > 0 ? form.dueDate : null;
        (cleaned as UpdateTaskInput).contactId =
          form.contactId.length > 0 ? form.contactId : null;
        (cleaned as UpdateTaskInput).leadId =
          form.leadId.length > 0 ? form.leadId : null;
        (cleaned as UpdateTaskInput).dealId =
          form.dealId.length > 0 ? form.dealId : null;
        (cleaned as UpdateTaskInput).assignedToId =
          form.assignedToId.length > 0 ? form.assignedToId : null;
      } else {
        // Create mode: there is no old value to accidentally preserve,
        // so an empty optional field is simply omitted.
        if (form.dueDate.length > 0) {
          cleaned.dueDate = form.dueDate;
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
            {t(isEdit ? "editTask" : "addTask")}
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
              <label className={labelClass}>{t("taskTitle")}</label>
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
              <label className={labelClass}>{t("taskStatus")}</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as TaskStatus)}
                className={inputClass}
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(TASK_STATUS_LABEL_KEY[status])}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("taskPriority")}</label>
              <select
                value={form.priority}
                onChange={(e) =>
                  set("priority", e.target.value as TaskPriority)
                }
                className={inputClass}
              >
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(TASK_PRIORITY_LABEL_KEY[priority])}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("taskDueDate")}</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
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
              <label className={labelClass}>{t("taskContact")}</label>
              <select
                value={form.contactId}
                onChange={(e) => set("contactId", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("taskNoneOption")}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.firstName} {contact.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("taskLead")}</label>
              <select
                value={form.leadId}
                onChange={(e) => set("leadId", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("taskNoneOption")}</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.firstName} {lead.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("taskDeal")}</label>
              <select
                value={form.dealId}
                onChange={(e) => set("dealId", e.target.value)}
                className={inputClass}
              >
                <option value="">{t("taskNoneOption")}</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className={labelClass}>{t("taskDescription")}</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="w-full resize-none rounded-[10px] bg-[#F7F7F8] px-3 py-2 text-sm text-gray-700 outline-none"
            />
          </div>

          {/* Read-only metadata — the "useful task details" this modal
              covers instead of a dedicated detail page (see TasksPage
              for why Tasks doesn't get one). */}
          {task && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
              <span>
                {t("taskCreatedAt")}:{" "}
                {new Date(task.createdAt).toLocaleDateString()}
              </span>
              {task.completedAt && (
                <span>
                  {t("taskCompletedAt")}:{" "}
                  {new Date(task.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

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