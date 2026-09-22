import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FaHandshake } from "react-icons/fa";
import { FiArrowLeft, FiEdit2, FiTrash2 } from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import { getDeal, updateDeal, deleteDeal } from "../../services/dealService";
import { listTeamMembers } from "../../services/userService";
import { getContact } from "../../services/contactService";
import { getLead } from "../../services/leadService";
import type { CreateDealInput, Deal } from "../../types/deal";
import {
  DEAL_STAGE_LABEL_KEY,
  dealStageBadgeClass,
  formatDealAmount,
} from "../../Components/Deal/dealStage";
import DealFormModal from "../../Components/Deal/DealFormModal";
import { confirmAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import { trackEvent } from "../../lib/posthog";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const canUpdate = hasPermission("deal:update");
  const canDelete = hasPermission("deal:delete");

  const [deal, setDeal] = useState<Deal | null>(null);
const [status, setStatus] = useState<
  "loading" | "ready" | "error" | "not-found"
>("loading");
  const [isEditing, setIsEditing] = useState(false);

  // Only for showing the assignee's name — see DealsPage for the same
  // pattern and why no extra permission is needed for it.
  const [memberNameById, setMemberNameById] = useState<Record<string, string>>(
    {},
  );
  const [contactName, setContactName] = useState<string | null>(null);
  const [leadName, setLeadName] = useState<string | null>(null);

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
        // Non-fatal — assignee name just falls back to "Unassigned".
      });
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setStatus("loading");
    try {
      const result = await getDeal(id);
      setDeal(result);
      setStatus("ready");
    } catch (error) {
      // A deal belonging to another tenant 404s exactly like an unknown
      // id (see DealRepository.findById's companyId scoping) — both
      // land here.
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

  // Local inline call rather than calling the hoisted `load` useCallback
  // directly — see react-hooks/set-state-in-effect.
  useEffect(() => {
    const loadOnMount = async () => {
      await load();
    };
    loadOnMount();
  }, [load]);

  // Resolves the related Contact/Lead's display name for this one deal.
  // A single getContact/getLead lookup each (not the full list, unlike
  // the team-member map above) — simpler here since there's only ever
  // one of each to resolve per page view, and both already enforce the
  // same tenant scoping as everything else.
  useEffect(() => {
    if (deal?.contactId) {
      getContact(deal.contactId)
        .then((contact) =>
          setContactName(`${contact.firstName} ${contact.lastName}`.trim()),
        )
        .catch(() => {
          // Non-fatal — the section just falls back to "—".
        });
    }

    if (deal?.leadId) {
      getLead(deal.leadId)
        .then((lead) => setLeadName(`${lead.firstName} ${lead.lastName}`.trim()))
        .catch(() => {
          // Non-fatal — the section just falls back to "—".
        });
    }
  }, [deal?.contactId, deal?.leadId]);

  const handleUpdate = async (input: CreateDealInput) => {
    if (!deal) return;
    const previousStage = deal.stage;
    const updated = await updateDeal(deal.id, input);
    trackEvent("deal_updated", { stage: updated.stage });
    if (updated.stage !== previousStage) {
      trackEvent("deal_stage_changed", {
        from: previousStage,
        to: updated.stage,
      });
      if (updated.stage === "closed_won") {
        trackEvent("deal_won", { amount: updated.amount });
      } else if (updated.stage === "closed_lost") {
        trackEvent("deal_lost");
      }
    }
    setDeal(updated);
  };

  const handleDelete = async () => {
    if (!deal) return;

    const confirmed = await confirmAlert({
      title: t("confirmDeleteTitle"),
      text: t("deleteDealConfirm"),
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await deleteDeal(deal.id);
      trackEvent("deal_deleted");
      navigate("/dashboard/deals", { replace: true });
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
          {t("noDealsFoundTitle")}
        </p>
        <button
          type="button"
          onClick={() => navigate("/dashboard/deals")}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          {t("backToList", { label: t("dealsNavLabel") })}
        </button>
      </div>
    );
  }

  if (status === "error" || !deal) {
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
        onClick={() => navigate("/dashboard/deals")}
        className="flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600"
      >
        <FiArrowLeft size={14} />
        {t("backToList", { label: t("dealsNavLabel") })}
      </button>

      <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
            <FaHandshake size={20} />
          </div>
          <div className="flex gap-1">
            {canUpdate && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label={t("edit")}
                className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
              >
                <FiEdit2 size={15} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                aria-label={t("delete")}
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
              >
                <FiTrash2 size={15} />
              </button>
            )}
          </div>
        </div>

        <h1 className="mt-3 truncate font-nunito text-lg font-semibold text-slate-800">
          {deal.title}
        </h1>

        <p className="text-sm text-slate-500">{formatDealAmount(deal.amount)}</p>

        <span
          className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${dealStageBadgeClass(deal.stage)}`}
        >
          {t(DEAL_STAGE_LABEL_KEY[deal.stage] ?? deal.stage)}
        </span>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {t("dealExpectedCloseDate")}
            </p>
            <p className="mt-0.5 text-slate-600">
              {deal.expectedCloseDate
                ? deal.expectedCloseDate.slice(0, 10)
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {t("assignedTo")}
            </p>
            <p className="mt-0.5 text-slate-600">
              {deal.assignedToId
                ? (memberNameById[deal.assignedToId] ?? "—")
                : t("unassigned")}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {t("dealContact")}
            </p>
            <p className="mt-0.5 text-slate-600">
              {deal.contactId ? (contactName ?? "—") : t("dealNoneOption")}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {t("dealLead")}
            </p>
            <p className="mt-0.5 text-slate-600">
              {deal.leadId ? (leadName ?? "—") : t("dealNoneOption")}
            </p>
          </div>
        </div>

        {deal.notes && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500">
              {t("notes")}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
              {deal.notes}
            </p>
          </div>
        )}
      </div>

      {isEditing && (
        <DealFormModal
          deal={deal}
          onClose={() => setIsEditing(false)}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}