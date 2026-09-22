import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiPlus, FiSearch, FiTrash2, FiEdit2 } from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import {
  listDeals,
  createDeal,
  updateDeal,
  deleteDeal,
} from "../../services/dealService";
import { listTeamMembers } from "../../services/userService";
import type { Deal, CreateDealInput } from "../../types/deal";
import { DEAL_STAGES } from "../../types/deal";
import {
  DEAL_STAGE_LABEL_KEY,
  dealStageBadgeClass,
  formatDealAmount,
} from "../../Components/Deal/dealStage";
import DealFormModal from "../../Components/Deal/DealFormModal";
import { confirmAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import { trackEvent } from "../../lib/posthog";

const PAGE_SIZE = 10;

export default function DealsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const canCreate = hasPermission("deal:create");
  const canUpdate = hasPermission("deal:update");
  const canDelete = hasPermission("deal:delete");

  const [deals, setDeals] = useState<Deal[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [modalMode, setModalMode] = useState<"create" | Deal | null>(null);

  // Only for showing an assignee's name next to each deal — any
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
        const result = await listDeals({
          page: targetPage,
          limit: PAGE_SIZE,
          search: search.trim() || undefined,
          stage: (stageFilter || undefined) as Deal["stage"] | undefined,
          sortBy: "createdAt",
          sortOrder: "desc",
        });
        setDeals(result.deals);
        setPage(result.meta.page);
        setTotalPages(result.meta.totalPages);
        setTotal(result.meta.total);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    },
    [search, stageFilter],
  );

  useEffect(() => {
    const timeout = setTimeout(() => load(1), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stageFilter]);

  const trackStageOutcome = (previousStage: string, updated: Deal) => {
    if (updated.stage === previousStage) return;

    trackEvent("deal_stage_changed", {
      from: previousStage,
      to: updated.stage,
    });

    if (updated.stage === "closed_won") {
      trackEvent("deal_won", { amount: updated.amount });
    } else if (updated.stage === "closed_lost") {
      trackEvent("deal_lost");
    }
  };

  const handleCreateOrUpdate = async (input: CreateDealInput) => {
    if (modalMode && modalMode !== "create") {
      const previousStage = modalMode.stage;
      const updated = await updateDeal(modalMode.id, input);
      trackEvent("deal_updated", { stage: updated.stage });
      trackStageOutcome(previousStage, updated);
      setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } else {
      const created = await createDeal(input);
      trackEvent("deal_created", { stage: created.stage });
      setDeals((prev) => [created, ...prev].slice(0, PAGE_SIZE));
      setTotal((prev) => prev + 1);
    }
  };

  const handleDelete = async (deal: Deal) => {
    const confirmed = await confirmAlert({
      title: t("confirmDeleteTitle"),
      text: t("deleteDealConfirm"),
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    });
    if (!confirmed) return;

    const previous = deals;
    setDeals((prev) => prev.filter((d) => d.id !== deal.id));

    try {
      await deleteDeal(deal.id);
      trackEvent("deal_deleted");
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (error) {
      setDeals(previous);
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
            placeholder={t("searchDealsPlaceholder")}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-300"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none"
          >
            <option value="">{t("allStages")}</option>
            {DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {t(DEAL_STAGE_LABEL_KEY[s])}
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
              <span className="hidden sm:inline">{t("addDeal")}</span>
            </button>
          )}
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

        {status === "ready" && deals.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-14 text-center">
            <p className="text-sm font-medium text-slate-600">
              {t("noDealsFoundTitle")}
            </p>
            <p className="text-xs text-slate-400">
              {t("noDealsFoundDescription")}
            </p>
          </div>
        )}

        {status === "ready" && deals.length > 0 && (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-left sm:table">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">{t("deal")}</th>
                  <th className="px-5 py-3 font-medium">{t("dealAmount")}</th>
                  <th className="px-5 py-3 font-medium">
                    {t("dealExpectedCloseDate")}
                  </th>
                  <th className="px-5 py-3 font-medium">{t("assignedTo")}</th>
                  <th className="px-5 py-3 font-medium">{t("dealStage")}</th>
                  <th className="px-5 py-3 font-medium text-right">
                    {t("actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr
                    key={deal.id}
                    onClick={() => navigate(`/dashboard/deals/${deal.id}`)}
                    className="cursor-pointer border-b border-slate-50 text-sm last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {deal.title}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {formatDealAmount(deal.amount)}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {deal.expectedCloseDate
                        ? deal.expectedCloseDate.slice(0, 10)
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {deal.assignedToId
                        ? (memberNameById[deal.assignedToId] ?? "—")
                        : t("unassigned")}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${dealStageBadgeClass(deal.stage)}`}
                      >
                        {t(DEAL_STAGE_LABEL_KEY[deal.stage] ?? deal.stage)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalMode(deal);
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
                              handleDelete(deal);
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
              {deals.map((deal) => (
                <div
                  key={deal.id}
                  onClick={() => navigate(`/dashboard/deals/${deal.id}`)}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {deal.title}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {formatDealAmount(deal.amount)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${dealStageBadgeClass(deal.stage)}`}
                  >
                    {t(DEAL_STAGE_LABEL_KEY[deal.stage] ?? deal.stage)}
                  </span>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>
                  {total} {t("dealsNavLabel").toLowerCase()}
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
        <DealFormModal
          deal={modalMode === "create" ? undefined : modalMode}
          onClose={() => setModalMode(null)}
          onSubmit={handleCreateOrUpdate}
        />
      )}
    </div>
  );
}