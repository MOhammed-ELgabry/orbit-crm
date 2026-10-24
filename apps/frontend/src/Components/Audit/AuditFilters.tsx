import { useTranslation } from "react-i18next";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  type AuditActor,
} from "../../types/audit";
import {
  auditActionKey,
  auditEntityKey,
  type AuditRangeError,
} from "../../lib/auditFormat";

export interface AuditFilterValues {
  from: string;
  to: string;
  actorUserId: string;
  action: string;
  entityType: string;
  q: string;
}

interface AuditFiltersProps {
  values: AuditFilterValues;
  actors: AuditActor[];
  rangeError: AuditRangeError | null;
  onChange: (next: AuditFilterValues) => void;
  onApply: () => void;
  onReset: () => void;
}

const RANGE_ERROR_KEY: Record<AuditRangeError, string> = {
  incomplete: "auditRangeIncomplete",
  order: "auditRangeOrder",
  tooLong: "auditRangeTooLong",
};

const FIELD =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#605BFF] focus:outline-none focus:ring-2 focus:ring-[#605BFF]/20";
const LABEL = "mb-1 block text-xs font-semibold text-slate-600";

export default function AuditFilters({
  values,
  actors,
  rangeError,
  onChange,
  onApply,
  onReset,
}: AuditFiltersProps) {
  const { t } = useTranslation();

  const set = (patch: Partial<AuditFilterValues>) =>
    onChange({ ...values, ...patch });

  return (
    <form
      role="search"
      aria-label={t("auditFiltersLabel")}
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
      className="rounded-2xl border border-slate-100 bg-white p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="audit-from" className={LABEL}>
            {t("auditFilterFrom")}
          </label>
          <input
            id="audit-from"
            type="date"
            value={values.from}
            onChange={(e) => set({ from: e.target.value })}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="audit-to" className={LABEL}>
            {t("auditFilterTo")}
          </label>
          <input
            id="audit-to"
            type="date"
            value={values.to}
            onChange={(e) => set({ to: e.target.value })}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="audit-actor" className={LABEL}>
            {t("auditFilterActor")}
          </label>
          <select
            id="audit-actor"
            value={values.actorUserId}
            onChange={(e) => set({ actorUserId: e.target.value })}
            className={FIELD}
          >
            <option value="">{t("auditFilterAllActors")}</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name ?? t("auditUnknownActor")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-entity" className={LABEL}>
            {t("auditFilterEntity")}
          </label>
          <select
            id="audit-entity"
            value={values.entityType}
            onChange={(e) => set({ entityType: e.target.value })}
            className={FIELD}
          >
            <option value="">{t("auditFilterAllEntities")}</option>
            {AUDIT_ENTITY_TYPES.map((entity) => (
              <option key={entity} value={entity}>
                {t(auditEntityKey(entity))}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-action" className={LABEL}>
            {t("auditFilterAction")}
          </label>
          <select
            id="audit-action"
            value={values.action}
            onChange={(e) => set({ action: e.target.value })}
            className={FIELD}
          >
            <option value="">{t("auditFilterAllActions")}</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {t(auditActionKey(action))}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-q" className={LABEL}>
            {t("auditFilterSearch")}
          </label>
          <input
            id="audit-q"
            type="search"
            dir="auto"
            maxLength={100}
            value={values.q}
            placeholder={t("auditFilterSearchPlaceholder")}
            onChange={(e) => set({ q: e.target.value })}
            className={FIELD}
          />
        </div>
      </div>

      {rangeError && (
        <p role="alert" className="mt-3 text-xs text-rose-600">
          {t(RANGE_ERROR_KEY[rangeError])}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-[#605BFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#514cf0]"
        >
          {t("auditApply")}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t("auditReset")}
        </button>
      </div>
    </form>
  );
}
