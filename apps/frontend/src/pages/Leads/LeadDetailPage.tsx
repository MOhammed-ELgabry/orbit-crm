import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FiArrowLeft,
  FiEdit2,
  FiTrash2,
  FiMail,
  FiPhone,
} from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import {
  getLead,
  updateLead,
  deleteLead,
  leadDisplayName,
} from "../../services/leadService";
import { listTeamMembers } from "../../services/userService";
import type { CreateLeadInput, Lead } from "../../types/lead";
import {
  LEAD_STATUS_LABEL_KEY,
  leadStatusBadgeClass,
} from "../../Components/Lead/leadStatus";
import LeadFormModal from "../../Components/Lead/LeadFormModal";
import { confirmAlert, errorAlert } from "../../lib/swal";
import { getErrorMessage } from "../../lib/errors";
import { trackEvent } from "../../lib/posthog";

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const canUpdate = hasPermission("lead:update");
  const canDelete = hasPermission("lead:delete");

  const [lead, setLead] = useState<Lead | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "not-found"
  >("loading");
  const [isEditing, setIsEditing] = useState(false);

  // Only for showing the assignee's name — see LeadsPage for the same
  // pattern and why no extra permission is needed for it.
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
        // Non-fatal — assignee name just falls back to "Unassigned".
      });
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setStatus("loading");
    try {
      const result = await getLead(id);
      setLead(result);
      setStatus("ready");
    } catch (error) {
      // A lead belonging to another tenant 404s exactly like an unknown
      // id (see LeadRepository.findById's companyId scoping) — both
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

  const handleUpdate = async (input: CreateLeadInput) => {
    if (!lead) return;
    const updated = await updateLead(lead.id, input);
    trackEvent("lead_updated", { status: updated.status });
    setLead(updated);
  };

  const handleDelete = async () => {
    if (!lead) return;

    const confirmed = await confirmAlert({
      title: t("confirmDeleteTitle"),
      text: t("deleteLeadConfirm"),
      confirmButtonText: t("delete"),
      cancelButtonText: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await deleteLead(lead.id);
      trackEvent("lead_deleted");
      navigate("/dashboard/leads", { replace: true });
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
          {t("noLeadsFoundTitle")}
        </p>
        <button
          type="button"
          onClick={() => navigate("/dashboard/leads")}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          {t("backToList", { label: t("leadsNavLabel") })}
        </button>
      </div>
    );
  }

  if (status === "error" || !lead) {
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
        onClick={() => navigate("/dashboard/leads")}
        className="flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600"
      >
        <FiArrowLeft size={14} />
        {t("backToList", { label: t("leadsNavLabel") })}
      </button>

      <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500 text-base font-semibold text-white">
            {lead.firstName[0]}
            {lead.lastName[0]}
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
          {leadDisplayName(lead)}
        </h1>

        {lead.organizationName && (
          <p className="truncate text-sm text-slate-500">
            {lead.organizationName}
          </p>
        )}

        <span
          className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${leadStatusBadgeClass(lead.status)}`}
        >
          {t(LEAD_STATUS_LABEL_KEY[lead.status] ?? lead.status)}
        </span>

        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 text-sm">
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-2 text-slate-600 hover:text-blue-600"
            >
              <FiMail size={14} className="shrink-0 text-slate-400" />
              <span className="truncate">{lead.email}</span>
            </a>
          )}
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="flex items-center gap-2 text-slate-600 hover:text-blue-600"
            >
              <FiPhone size={14} className="shrink-0 text-slate-400" />
              <span className="truncate">{lead.phone}</span>
            </a>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {t("leadSource")}
            </p>
            <p className="mt-0.5 text-slate-600">{lead.source || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {t("assignedTo")}
            </p>
            <p className="mt-0.5 text-slate-600">
              {lead.assignedToId
                ? (memberNameById[lead.assignedToId] ?? "—")
                : t("unassigned")}
            </p>
          </div>
        </div>

        {lead.notes && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500">{t("notes")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
              {lead.notes}
            </p>
          </div>
        )}
      </div>

      {isEditing && (
        <LeadFormModal
          lead={lead}
          onClose={() => setIsEditing(false)}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}
