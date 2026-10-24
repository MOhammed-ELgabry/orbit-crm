import { useTranslation } from "react-i18next";

import type { AuditChanges } from "../../types/audit";
import {
  auditFieldKey,
  classifyChange,
  formatAuditValue,
} from "../../lib/auditFormat";

/**
 * Renders `changes` exactly as the backend stored them. Personal / free-text
 * fields arrive as `{ changed: true }` and are shown as "value not recorded":
 * the log never held those values, so there is nothing to reveal and nothing
 * to hide. Every value is rendered as text (React escapes it); no HTML is ever
 * interpreted.
 */
export default function AuditChangeList({
  changes,
}: {
  changes: AuditChanges | null;
}) {
  const { t, i18n } = useTranslation();

  const entries = changes ? Object.entries(changes) : [];

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">{t("auditNoChanges")}</p>;
  }

  const labels = {
    yes: t("auditYes"),
    no: t("auditNo"),
    empty: t("auditEmptyValue"),
  };
  const show = (value: unknown) =>
    formatAuditValue(value, i18n.language, labels);

  return (
    <dl className="flex flex-col gap-3">
      {entries.map(([field, change]) => {
        const kind = classifyChange(change);

        return (
          <div
            key={field}
            className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"
          >
            <dt className="text-xs font-semibold text-slate-600">
              {t(auditFieldKey(field), { defaultValue: field })}
            </dt>

            <dd className="mt-1 text-sm text-slate-800">
              {kind === "masked" && (
                <span className="text-slate-500">
                  {t("auditValueNotRecorded")}
                </span>
              )}

              {kind === "values" && "old" in change && "new" in change && (
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    dir="auto"
                    className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700"
                    aria-label={t("auditOldValue")}
                  >
                    {show(change.old)}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    →
                  </span>
                  <span
                    dir="auto"
                    className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
                    aria-label={t("auditNewValue")}
                  >
                    {show(change.new)}
                  </span>
                </span>
              )}

              {kind === "permissions" &&
                "added" in change &&
                "removed" in change && (
                  <div className="flex flex-col gap-2">
                    <PermissionLine
                      label={t("auditPermissionsAdded")}
                      items={change.added}
                      tone="text-emerald-700 bg-emerald-50"
                    />
                    <PermissionLine
                      label={t("auditPermissionsRemoved")}
                      items={change.removed}
                      tone="text-rose-700 bg-rose-50"
                    />
                  </div>
                )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function PermissionLine({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: string;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            dir="ltr"
            className={`rounded px-1.5 py-0.5 font-mono text-xs ${tone}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
