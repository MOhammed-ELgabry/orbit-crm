import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiX } from "react-icons/fi";

import type { Contact, CreateContactInput } from "../../types/contact";
import { CONTACT_STATUSES } from "../../types/contact";
import { CONTACT_STATUS_LABEL_KEY } from "./contactStatus";
import { getErrorMessage } from "../../lib/errors";
import { errorAlert } from "../../lib/swal";

interface ContactFormModalProps {
  /** Present for edit, absent for create. */
  contact?: Contact;
  contactLabel: string;
  onClose: () => void;
  onSubmit: (input: CreateContactInput) => Promise<void>;
}

const emptyForm: CreateContactInput = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  mobile: "",
  jobTitle: "",
  organizationName: "",
  notes: "",
  status: "lead",
};

const inputClass =
  "h-[38px] w-full rounded-[10px] bg-[#F7F7F8] px-3 text-sm text-gray-700 outline-none ring-1 ring-transparent focus:ring-blue-200";
const labelClass = "text-xs font-semibold text-gray-700";

export default function ContactFormModal({
  contact,
  contactLabel,
  onClose,
  onSubmit,
}: ContactFormModalProps) {
  const { t } = useTranslation();
  const isEdit = Boolean(contact);

  const [form, setForm] = useState<CreateContactInput>(
    contact
      ? {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          mobile: contact.mobile ?? "",
          jobTitle: contact.jobTitle ?? "",
          organizationName: contact.organizationName ?? "",
          notes: contact.notes ?? "",
          status: contact.status,
        }
      : emptyForm,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = <K extends keyof CreateContactInput>(
    key: K,
    value: CreateContactInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.firstName.trim() || !form.lastName.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Strip empty-string optional fields so we don't send e.g.
      // email: "" and trip @IsEmail() server-side on a field the user
      // just left blank.
      const cleaned: CreateContactInput = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        status: form.status,
      };
      const optionalKeys: (keyof CreateContactInput)[] = [
        "email",
        "phone",
        "mobile",
        "jobTitle",
        "organizationName",
        "notes",
      ];
      for (const key of optionalKeys) {
        const value = form[key];
        if (typeof value === "string" && value.trim().length > 0) {
          (cleaned as unknown as Record<string, unknown>)[key] = value.trim();
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
            {t(isEdit ? "editContact" : "addContact", { label: contactLabel })}
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
            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("firstName")}</label>
              <input
                type="text"
                required
                maxLength={100}
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("lastName")}</label>
              <input
                type="text"
                required
                maxLength={100}
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("email")}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("phone")}</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("jobTitle")}</label>
              <input
                type="text"
                value={form.jobTitle}
                onChange={(e) => set("jobTitle", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className={labelClass}>{t("organization")}</label>
              <input
                type="text"
                value={form.organizationName}
                onChange={(e) => set("organizationName", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-0.5 sm:col-span-2">
              <label className={labelClass}>{t("status")}</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className={inputClass}
              >
                {CONTACT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(CONTACT_STATUS_LABEL_KEY[status])}
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
              disabled={isSubmitting || !form.firstName.trim() || !form.lastName.trim()}
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
