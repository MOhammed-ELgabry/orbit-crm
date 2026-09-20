import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiPlus, FiSearch, FiTrash2, FiEdit2 } from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import {
  listLeads,
  createLead,
  updateLead,
  deleteLead,
  leadDisplayName,
} from "../../services/leadService";
import { listTeamMembers } from "../../services/userService";
import type { Lead } from "../../types/lead";
import { LEAD_STATUSES } from "../../types/lead";
import type { CreateLeadInput } from "../../types/lead";
import {
  LEAD_STATUS_LABEL_KEY,
  leadStatusBadgeClass,
} from "../../Components/Lead/leadStatus";
import LeadFormModal from "../../Components/Lead/LeadFormModal";
import { confirmAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import { trackEvent } from "../../lib/posthog";

const PAGE_SIZE = 10;

export default function LeadsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const canCreate = hasPermission("lead:create");
  const canUpdate = hasPermission("lead:update");
  const canDelete = hasPermission("lead:delete");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [modalMode, setModalMode] = useState<"create" | Lead | null>(null);

  // Only for showing an assignee's name next to each lead — any
  // authenticated tenant member can already list team members (see
  // UsersPage), so this needs no extra permission of its own.
  const [memberNameById, setMemberNameById] = useState<Record<string, string>>(
    {},
  );

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
        // Non-fatal — assignee names just fall back to "Unassigned".
      });
  }, []);

  const load = useCallback(
    async (targetPage: number) => {
      setStatus("loading");
      try {
        const result = await listLeads({
          page: targetPage,
          limit: PAGE_SIZE,
          search: search.trim() || undefined,
          status: (statusFilter || undefined) as Lead["status"] | undefined,
          sortBy: "createdAt",
          sortOrder: "desc",
        });
        setLeads(result.leads);
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

  const handleCreateOrUpdate = async (input: CreateLeadInput) => {
    if (modalMode && modalMode !== "create") {
      const updated = await updateLead(modalMode.id, input);
      trackEvent("lead_updated", { status: updated.status });
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } else {
      const created = await createLead(input);
      trackEvent("lead_created", { status: created.status });
      setLeads((prev) => [created, ...prev].slice(0, PAGE_SIZE));
      setTotal((prev) => prev + 1);
    }
  };

  const handleDelete = async (lead: Lead) => {
    const confirmed = await confirmAlert({
      title: t("confirmDeleteTitle"),
      text: t("deleteLeadConfirm"),
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    });
    if (!confirmed) return;

    const previous = leads;
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));

    try {
      await deleteLead(lead.id);
      trackEvent("lead_deleted");
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (error) {
      setLeads(previous);
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
            placeholder={t("searchLeadsPlaceholder")}
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
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(LEAD_STATUS_LABEL_KEY[s])}
              </option>
            ))}
          </select>

          {canCreate && (
            <button
              type="button"
              onClick={() => setModalMode("create")}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#605BFF] px-4 text-sm font-semibold text-white hover:bg-[#514cf0]"
            >
              <FiPlus size={16} />
              <span className="hidden sm:inline">{t("addLead")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-slate-100 bg-white">
        {status === "loading" && (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-slate-50"
              />
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

        {status === "ready" && leads.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-14 text-center">
            <p className="text-sm font-medium text-slate-600">
              {t("noLeadsFoundTitle")}
            </p>
            <p className="text-xs text-slate-400">
              {t("noLeadsFoundDescription")}
            </p>
          </div>
        )}

        {status === "ready" && leads.length > 0 && (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-left sm:table">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">{t("lead")}</th>
                  <th className="px-5 py-3 font-medium">{t("email")}</th>
                  <th className="px-5 py-3 font-medium">{t("phone")}</th>
                  <th className="px-5 py-3 font-medium">{t("leadSource")}</th>
                  <th className="px-5 py-3 font-medium">{t("assignedTo")}</th>
                  <th className="px-5 py-3 font-medium">{t("status")}</th>
                  <th className="px-5 py-3 font-medium text-right">
                    {t("actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => navigate(`/dashboard/leads/${lead.id}`)}
                    className="cursor-pointer border-b border-slate-50 text-sm last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {leadDisplayName(lead)}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {lead.email || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {lead.phone || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {lead.source || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {lead.assignedToId
                        ? (memberNameById[lead.assignedToId] ?? "—")
                        : t("unassigned")}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${leadStatusBadgeClass(lead.status)}`}
                      >
                        {t(LEAD_STATUS_LABEL_KEY[lead.status] ?? lead.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalMode(lead);
                            }}
                            aria-label={t("edit")}
                            className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <FiEdit2 size={15} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(lead);
                            }}
                            aria-label={t("delete")}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <FiTrash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="divide-y divide-slate-50 sm:hidden">
              {leads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => navigate(`/dashboard/leads/${lead.id}`)}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {leadDisplayName(lead)}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {lead.email || lead.phone || "—"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${leadStatusBadgeClass(lead.status)}`}
                  >
                    {t(LEAD_STATUS_LABEL_KEY[lead.status] ?? lead.status)}
                  </span>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>
                  {total} {t("leadsNavLabel").toLowerCase()}
                </span>
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
        <LeadFormModal
          lead={modalMode === "create" ? undefined : modalMode}
          onClose={() => setModalMode(null)}
          onSubmit={handleCreateOrUpdate}
        />
      )}
    </div>
  );
}
