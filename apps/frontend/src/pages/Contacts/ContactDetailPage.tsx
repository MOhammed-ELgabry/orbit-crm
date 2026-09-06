import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiArrowLeft, FiEdit2, FiTrash2, FiMail, FiPhone } from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import { getBusinessTypeCopy } from "../../config/businessType";
import {
  getContact,
  updateContact,
  deleteContact,
  contactDisplayName,
} from "../../services/contactService";
import type { Contact, CreateContactInput } from "../../types/contact";
import {
  CONTACT_STATUS_LABEL_KEY,
  contactStatusBadgeClass,
} from "../../Components/Contact/contactStatus";
import ContactFormModal from "../../Components/Contact/ContactFormModal";
import ActivityTimeline from "../../Components/Activity/ActivityTimeline";
import { confirmAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { company } = useAuth();
  const businessCopy = getBusinessTypeCopy(company?.businessType);
  const contactLabel = t(businessCopy.contactSingular);

  const [contact, setContact] = useState<Contact | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "not-found">(
    "loading",
  );
  const [isEditing, setIsEditing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setStatus("loading");
    try {
      const result = await getContact(id);
      setContact(result);
      setStatus("ready");
    } catch (error) {
      // A contact belonging to another tenant 404s exactly like an
      // unknown id (see ContactService on the backend) — both land here.
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        setStatus("not-found");
      } else {
        setStatus("error");
      }
    }
  }, [id]);

  // Local inline call rather than calling the hoisted `load`
  // useCallback directly — see react-hooks/set-state-in-effect.
  useEffect(() => {
    const loadOnMount = async () => {
      await load();
    };
    loadOnMount();
  }, [load]);

  const handleUpdate = async (input: CreateContactInput) => {
    if (!contact) return;
    const updated = await updateContact(contact.id, input);
    setContact(updated);
  };

  const handleDelete = async () => {
    if (!contact) return;

    const confirmed = await confirmAlert({
      title: t("confirmDeleteTitle"),
      text: t("deleteContactConfirm", { label: contactLabel }),
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await deleteContact(contact.id);
      navigate("/dashboard/contacts", { replace: true });
    } catch (error) {
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    }
  };

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white py-16 text-center">
        <p className="text-sm font-medium text-slate-600">
          {t("noContactsFoundTitle", { label: contactLabel })}
        </p>
        <button
          type="button"
          onClick={() => navigate("/dashboard/contacts")}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          {t("backToList", { label: t(businessCopy.contactsLabel) })}
        </button>
      </div>
    );
  }

  if (status === "error" || !contact) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white py-16 text-center">
        <p className="text-sm text-slate-500">{t("somethingWentWrong")}</p>
        <button
          type="button"
          onClick={() => load()}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate("/dashboard/contacts")}
        className="flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600"
      >
        <FiArrowLeft size={14} />
        {t("backToList", { label: t(businessCopy.contactsLabel) })}
      </button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Profile card */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 lg:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500 text-base font-semibold text-white">
              {contact.firstName[0]}
              {contact.lastName[0]}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label={t("edit")}
                className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
              >
                <FiEdit2 size={15} />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                aria-label={t("delete")}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
              >
                <FiTrash2 size={15} />
              </button>
            </div>
          </div>

          <h1 className="mt-3 truncate font-nunito text-lg font-semibold text-slate-800">
            {contactDisplayName(contact)}
          </h1>

          {(contact.jobTitle || contact.organizationName) && (
            <p className="truncate text-sm text-slate-500">
              {[contact.jobTitle, contact.organizationName]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          <span
            className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${contactStatusBadgeClass(contact.status)}`}
          >
            {t(CONTACT_STATUS_LABEL_KEY[contact.status] ?? contact.status)}
          </span>

          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 text-sm">
           {contact.email && (
  <a
    href={`mailto:${contact.email}`}
    className="flex items-center gap-2 text-slate-600 hover:text-blue-600"
  >
                <FiMail size={14} className="shrink-0 text-slate-400" />
                <span className="truncate">{contact.email}</span>
              </a>
            )}
            {contact.phone && (
               <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-2 text-slate-600 hover:text-blue-600"
              >
                <FiPhone size={14} className="shrink-0 text-slate-400" />
                <span className="truncate">{contact.phone}</span>
              </a>
            )}
          </div>

          {contact.notes && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500">
                {t("notes")}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                {contact.notes}
              </p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2">
          <ActivityTimeline contactId={contact.id} />
        </div>
      </div>

      {isEditing && (
        <ContactFormModal
          contact={contact}
          contactLabel={contactLabel}
          onClose={() => setIsEditing(false)}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}