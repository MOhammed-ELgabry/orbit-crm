import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiPlus, FiSearch, FiTrash2, FiEdit2 } from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import { getBusinessTypeCopy } from "../../config/businessType";
import {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  contactDisplayName,
} from "../../services/contactService";
import type { Contact, CreateContactInput } from "../../types/contact";
import { CONTACT_STATUSES } from "../../types/contact";
import {
  CONTACT_STATUS_LABEL_KEY,
  contactStatusBadgeClass,
} from "../../Components/Contact/contactStatus";
import ContactFormModal from "../../Components/Contact/ContactFormModal";
import { confirmAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";

const PAGE_SIZE = 10;

export default function ContactsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { company } = useAuth();
  const businessCopy = getBusinessTypeCopy(company?.businessType);
  const contactLabel = t(businessCopy.contactSingular);
  const contactsLabel = t(businessCopy.contactsLabel);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [modalMode, setModalMode] = useState<"create" | Contact | null>(null);

  const load = useCallback(
    async (targetPage: number) => {
      setStatus("loading");
      try {
        const result = await listContacts({
          page: targetPage,
          limit: PAGE_SIZE,
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          sortBy: "createdAt",
          sortOrder: "desc",
        });
        setContacts(result.contacts);
        setPage(result.meta.page);
        setTotalPages(result.meta.totalPages);
        setTotal(result.meta.total);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    },
    [search, statusFilter],
  );

  useEffect(() => {
    const timeout = setTimeout(() => load(1), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const handleCreateOrUpdate = async (input: CreateContactInput) => {
    if (modalMode && modalMode !== "create") {
      const updated = await updateContact(modalMode.id, input);
      setContacts((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
    } else {
      const created = await createContact(input);
      setContacts((prev) => [created, ...prev].slice(0, PAGE_SIZE));
      setTotal((prev) => prev + 1);
    }
  };

  const handleDelete = async (contact: Contact) => {
    const confirmed = await confirmAlert({
      title: t("confirmDeleteTitle"),
      text: t("deleteContactConfirm", { label: contactLabel }),
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    });
    if (!confirmed) return;

    const previous = contacts;
    setContacts((prev) => prev.filter((c) => c.id !== contact.id));

    try {
      await deleteContact(contact.id);
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (error) {
      setContacts(previous);
      errorAlert({
        title: t("somethingWentWrong"),
        text: getErrorMessage(error, t("somethingWentWrong")),
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <FiSearch
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchContactsPlaceholder")}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-300"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none"
          >
            <option value="">{t("allStatuses")}</option>
            {CONTACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(CONTACT_STATUS_LABEL_KEY[s])}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setModalMode("create")}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#605BFF] px-4 text-sm font-semibold text-white hover:bg-[#514cf0]"
          >
            <FiPlus size={16} />
            <span className="hidden sm:inline">
              {t("addContact", { label: contactLabel })}
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-slate-100 bg-white">
        {status === "loading" && (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-50" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <p className="text-sm text-slate-500">{t("somethingWentWrong")}</p>
            <button
              type="button"
              onClick={() => load(page)}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {status === "ready" && contacts.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-14 text-center">
            <p className="text-sm font-medium text-slate-600">
              {t("noContactsFoundTitle", { label: contactsLabel })}
            </p>
            <p className="text-xs text-slate-400">
              {t("noContactsFoundDescription", { label: contactLabel })}
            </p>
          </div>
        )}

        {status === "ready" && contacts.length > 0 && (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-left sm:table">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">{contactLabel}</th>
                  <th className="px-5 py-3 font-medium">{t("email")}</th>
                  <th className="px-5 py-3 font-medium">{t("phone")}</th>
                  <th className="px-5 py-3 font-medium">{t("status")}</th>
                  <th className="px-5 py-3 font-medium text-right">
                    {t("actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => navigate(`/dashboard/contacts/${contact.id}`)}
                    className="cursor-pointer border-b border-slate-50 text-sm last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {contactDisplayName(contact)}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {contact.email || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {contact.phone || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${contactStatusBadgeClass(contact.status)}`}
                      >
                        {t(CONTACT_STATUS_LABEL_KEY[contact.status] ?? contact.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalMode(contact);
                          }}
                          aria-label={t("edit")}
                          className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                        >
                          <FiEdit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(contact);
                          }}
                          aria-label={t("delete")}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <FiTrash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="divide-y divide-slate-50 sm:hidden">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => navigate(`/dashboard/contacts/${contact.id}`)}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {contactDisplayName(contact)}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {contact.email || contact.phone || "—"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${contactStatusBadgeClass(contact.status)}`}
                  >
                    {t(CONTACT_STATUS_LABEL_KEY[contact.status] ?? contact.status)}
                  </span>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>{total} {contactsLabel.toLowerCase()}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => load(page - 1)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40"
                  >
                    &larr;
                  </button>
                  <span>
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => load(page + 1)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40"
                  >
                    &rarr;
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modalMode && (
        <ContactFormModal
          contact={modalMode === "create" ? undefined : modalMode}
          contactLabel={contactLabel}
          onClose={() => setModalMode(null)}
          onSubmit={handleCreateOrUpdate}
        />
      )}
    </div>
  );
}