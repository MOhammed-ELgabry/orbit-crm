import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { getAuditLog } from "../../services/auditService";
import { useKeyedResource } from "../../hooks/useKeyedResource";
import {
  auditEntityKey,
  auditMetaKey,
  auditMetaValueKey,
  formatAuditDate,
} from "../../lib/auditFormat";
import AuditActionBadge from "./AuditActionBadge";
import AuditActorName from "./AuditActorName";
import AuditChangeList from "./AuditChangeList";

interface AuditDetailDrawerProps {
  id: string;
  onClose: () => void;
}

export default function AuditDetailDrawer({
  id,
  onClose,
}: AuditDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => getAuditLog(id), [id]);
  const { status, data, retry } = useKeyedResource(id, load);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const metadata =
    data?.metadata && typeof data.metadata === "object"
      ? Object.entries(data.metadata).filter(
          ([, value]) =>
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean",
        )
      : [];

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Click-away backdrop. Deliberately not a button: Escape and the
          Close button are the accessible ways to dismiss the dialog. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/35"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2
            id="audit-detail-title"
            className="text-base font-semibold text-slate-900"
          >
            {t("auditDetailTitle")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("auditDetailClose")}
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-4">
          {status === "loading" && (
            <p role="status" className="text-sm text-slate-500">
              {t("auditDetailLoading")}
            </p>
          )}

          {(status === "error" ||
            status === "forbidden" ||
            status === "not-found") && (
            <div role="alert" className="text-sm text-slate-600">
              <p>
                {status === "not-found"
                  ? t("auditDetailNotFound")
                  : status === "forbidden"
                    ? t("auditForbidden")
                    : t("auditDetailError")}
              </p>
              {status === "error" && (
                <button
                  type="button"
                  onClick={retry}
                  className="mt-3 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  {t("auditRetry")}
                </button>
              )}
            </div>
          )}

          {status === "ready" && data && (
            <>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Info label={t("auditDetailWhen")}>
                  <time dateTime={data.occurredAt}>
                    {formatAuditDate(data.occurredAt, i18n.language)}
                  </time>
                </Info>

                <Info label={t("auditDetailActor")}>
                  <AuditActorName actor={data.actor} />
                </Info>

                <Info label={t("auditDetailEvent")}>
                  <span className="flex flex-wrap items-center gap-2">
                    <AuditActionBadge action={data.action} />
                    <span>
                      {t(auditEntityKey(data.entityType), {
                        defaultValue: data.entityType,
                      })}
                    </span>
                  </span>
                </Info>

                <Info label={t("auditDetailRecord")}>
                  <span dir="auto">{data.entityLabel ?? "—"}</span>
                </Info>

                {data.entityId && (
                  <Info label={t("auditDetailRecordId")}>
                    <span dir="ltr" className="font-mono text-xs break-all">
                      {data.entityId}
                    </span>
                  </Info>
                )}

                {data.correlationId && (
                  <Info label={t("auditDetailCorrelation")}>
                    <span dir="ltr" className="font-mono text-xs break-all">
                      {data.correlationId}
                    </span>
                  </Info>
                )}
              </dl>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  {t("auditDetailChanges")}
                </h3>
                <AuditChangeList changes={data.changes} />
              </section>

              {metadata.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">
                    {t("auditDetailMetadata")}
                  </h3>
                  <dl className="flex flex-col gap-1.5 text-sm">
                    {metadata.map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <dt className="text-slate-500">
                          {t(auditMetaKey(key), { defaultValue: key })}:
                        </dt>
                        <dd dir="auto" className="text-slate-800">
                          {typeof value === "string"
                            ? t(auditMetaValueKey(value), {
                                defaultValue: value,
                              })
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {(data.ipAddress || data.userAgent) && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">
                    {t("auditDetailRequest")}
                  </h3>
                  <dl className="flex flex-col gap-1.5 text-xs text-slate-600">
                    {data.ipAddress && (
                      <div className="flex gap-2">
                        <dt className="text-slate-500">
                          {t("auditDetailIp")}:
                        </dt>
                        <dd dir="ltr" className="font-mono">
                          {data.ipAddress}
                        </dd>
                      </div>
                    )}
                    {data.userAgent && (
                      <div className="flex gap-2">
                        <dt className="text-slate-500">
                          {t("auditDetailUserAgent")}:
                        </dt>
                        <dd dir="ltr" className="break-all">
                          {data.userAgent}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{children}</dd>
    </div>
  );
}
