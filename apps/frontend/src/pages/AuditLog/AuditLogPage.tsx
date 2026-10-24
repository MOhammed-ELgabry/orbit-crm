import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import AuditDetailDrawer from "../../Components/Audit/AuditDetailDrawer";
import AuditFilters, {
  type AuditFilterValues,
} from "../../Components/Audit/AuditFilters";
import AuditList from "../../Components/Audit/AuditList";
import { useKeyedResource } from "../../hooks/useKeyedResource";
import {
  buildAuditQuery,
  defaultAuditRange,
  resolveAuditRange,
  type AuditRangeError,
} from "../../lib/auditFormat";
import { listAuditActors, listAuditLogs } from "../../services/auditService";
import type { AuditLogListResult } from "../../types/audit";

const defaultFilters = (): AuditFilterValues => ({
  ...defaultAuditRange(),
  actorUserId: "",
  action: "",
  entityType: "",
  q: "",
});

/**
 * Owner-only audit log. Read-only: nothing on this page can create, edit,
 * delete or export an entry. Access is enforced by the backend on every
 * request; the route guard only decides what the UI shows.
 */
export default function AuditLogPage() {
  const { t } = useTranslation();

  const [draft, setDraft] = useState<AuditFilterValues>(defaultFilters);
  const [applied, setApplied] = useState<AuditFilterValues>(defaultFilters);
  const [page, setPage] = useState(1);
  const [rangeError, setRangeError] = useState<AuditRangeError | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const query = buildAuditQuery(applied, page);
  const key = query ? JSON.stringify(query) : null;

  const loadList = useCallback(
    () => (query ? listAuditLogs(query) : Promise.reject(new Error("range"))),
    // `key` is the serialised `query`; depending on it keeps this stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const list = useKeyedResource<AuditLogListResult>(key, loadList);

  const actorsLoader = useCallback(() => listAuditActors(), []);
  const actors = useKeyedResource("actors", actorsLoader);

  const apply = () => {
    const range = resolveAuditRange(draft.from, draft.to);

    if (!range.ok) {
      setRangeError(range.error);
      return;
    }

    setRangeError(null);
    setPage(1);
    setApplied(draft);
  };

  const reset = () => {
    const fresh = defaultFilters();
    setRangeError(null);
    setDraft(fresh);
    setApplied(fresh);
    setPage(1);
  };

  const open = (id: string, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setOpenId(id);
  };

  const close = useCallback(() => {
    setOpenId(null);
    triggerRef.current?.focus();
  }, []);

  const hasFilters =
    applied.actorUserId !== "" ||
    applied.action !== "" ||
    applied.entityType !== "" ||
    applied.q.trim() !== "";

  const meta = list.data?.meta;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-slate-600">
        {t("auditPageDescription")}
      </p>

      <AuditFilters
        values={draft}
        actors={actors.data ?? []}
        rangeError={rangeError}
        onChange={setDraft}
        onApply={apply}
        onReset={reset}
      />

      <div aria-live="polite">
        {list.status === "loading" && (
          <p
            role="status"
            className="rounded-2xl border border-slate-100 bg-white px-4 py-10 text-center text-sm text-slate-500"
          >
            {t("auditLoading")}
          </p>
        )}

        {list.status === "forbidden" && (
          <p
            role="alert"
            className="rounded-2xl border border-slate-100 bg-white px-4 py-10 text-center text-sm text-slate-600"
          >
            {t("auditForbidden")}
          </p>
        )}

        {(list.status === "error" || list.status === "not-found") && (
          <div
            role="alert"
            className="rounded-2xl border border-slate-100 bg-white px-4 py-10 text-center text-sm text-slate-600"
          >
            <p>{t("auditLoadError")}</p>
            <button
              type="button"
              onClick={list.retry}
              className="mt-3 rounded-lg bg-[#605BFF] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#514cf0]"
            >
              {t("auditRetry")}
            </button>
          </div>
        )}

        {list.status === "ready" &&
          list.data &&
          list.data.items.length === 0 && (
            <p className="rounded-2xl border border-slate-100 bg-white px-4 py-10 text-center text-sm text-slate-500">
              {hasFilters ? t("auditEmptyFiltered") : t("auditEmpty")}
            </p>
          )}

        {list.status === "ready" && list.data && list.data.items.length > 0 && (
          <AuditList items={list.data.items} onOpen={open} />
        )}
      </div>

      {meta && meta.total > 0 && (
        <nav
          aria-label={t("auditPagination")}
          className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"
        >
          <span>
            {t("auditPageOf", {
              page: meta.page,
              totalPages: Math.max(meta.totalPages, 1),
              total: meta.total,
            })}
          </span>

          <span className="flex gap-2">
            <button
              type="button"
              disabled={!meta.hasPreviousPage}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("auditPrevious")}
            </button>
            <button
              type="button"
              disabled={!meta.hasNextPage}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("auditNext")}
            </button>
          </span>
        </nav>
      )}

      {openId && <AuditDetailDrawer id={openId} onClose={close} />}
    </div>
  );
}
