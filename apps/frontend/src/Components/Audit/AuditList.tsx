import { useTranslation } from "react-i18next";

import type { AuditLogListItem } from "../../types/audit";
import {
  auditEntityKey,
  auditFieldKey,
  formatAuditDate,
} from "../../lib/auditFormat";
import AuditActionBadge from "./AuditActionBadge";
import AuditActorName from "./AuditActorName";

const MAX_FIELDS_SHOWN = 3;

interface AuditListProps {
  items: AuditLogListItem[];
  onOpen: (id: string, trigger: HTMLElement) => void;
}

/**
 * One responsive list: a table-like grid from `md` up, stacked cards below.
 * A single DOM structure serves both, so there is no duplicated (hidden)
 * markup for assistive technology to read twice.
 */
export default function AuditList({ items, onOpen }: AuditListProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <div
        aria-hidden="true"
        className="hidden grid-cols-[11rem_1.2fr_1.2fr_1.2fr_1.4fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid"
      >
        <span>{t("auditColWhen")}</span>
        <span>{t("auditColWho")}</span>
        <span>{t("auditColEvent")}</span>
        <span>{t("auditColRecord")}</span>
        <span>{t("auditColDetails")}</span>
      </div>

      <ul className="divide-y divide-slate-100">
        {items.map((item) => {
          const fields = item.changedFields.map((field) =>
            t(auditFieldKey(field), { defaultValue: field }),
          );
          const shown = fields.slice(0, MAX_FIELDS_SHOWN);
          const hidden = fields.length - shown.length;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={(event) => onOpen(item.id, event.currentTarget)}
                className="grid w-full grid-cols-1 gap-1.5 px-4 py-3 text-start hover:bg-slate-50 focus:bg-slate-50 focus:outline-none md:grid-cols-[11rem_1.2fr_1.2fr_1.2fr_1.4fr] md:items-center md:gap-3"
              >
                <time
                  dateTime={item.occurredAt}
                  className="text-xs text-slate-500 md:text-sm md:text-slate-700"
                >
                  {formatAuditDate(item.occurredAt, i18n.language)}
                </time>

                <span className="text-sm">
                  <AuditActorName actor={item.actor} />
                </span>

                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <AuditActionBadge action={item.action} />
                  <span className="text-slate-600">
                    {t(auditEntityKey(item.entityType), {
                      defaultValue: item.entityType,
                    })}
                  </span>
                </span>

                <span dir="auto" className="truncate text-sm text-slate-700">
                  {item.entityLabel ?? "—"}
                </span>

                <span className="text-xs text-slate-500">
                  {shown.length > 0 ? (
                    <>
                      <span dir="auto">{shown.join(", ")}</span>
                      {hidden > 0 &&
                        ` ${t("auditMoreFields", { count: hidden })}`}
                    </>
                  ) : (
                    ""
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
