import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiDownload } from "react-icons/fi";

import type { ImportCounts } from "../../../types/contactImport";

interface ImportSummaryStepProps {
  counts: ImportCounts;
  importing: boolean;
  importFailed: boolean;
  waitingForRateLimit: boolean;
  progress: { done: number; total: number };
  contactsLabel: string;
  hasReportRows: boolean;
  onStop: () => void;
  onContinue: () => void;
  onDownloadReport: () => void;
  onImportAnother: () => void;
  onViewContacts: () => void;
}

export default function ImportSummaryStep({
  counts,
  importing,
  importFailed,
  waitingForRateLimit,
  progress,
  contactsLabel,
  hasReportRows,
  onStop,
  onContinue,
  onDownloadReport,
  onImportAnother,
  onViewContacts,
}: ImportSummaryStepProps) {
  const { t } = useTranslation();

  const percent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const canContinue = counts.failed > 0 || counts.pending > 0;

  const title = importing
    ? t("contactsImportImporting", {
        done: progress.done.toLocaleString(),
        total: progress.total.toLocaleString(),
      })
    : importFailed || counts.failed > 0
      ? t("contactsImportResultFailedTitle")
      : counts.pending > 0
        ? t("contactsImportResultStoppedTitle")
        : t("contactsImportResultTitle");

  const cards: Array<{
    key: string;
    label: string;
    value: number;
    tone: string;
  }> = [
    {
      key: "created",
      label: t("contactsImportSummaryCreated"),
      value: counts.created,
      tone: "text-emerald-600",
    },
    {
      key: "skipped",
      label: t("contactsImportSummarySkipped"),
      value: counts.skipped,
      tone: "text-amber-600",
    },
    {
      key: "rejected",
      label: t("contactsImportSummaryRejected"),
      value: counts.rejected,
      tone: "text-red-500",
    },
    {
      key: "failed",
      label: t("contactsImportSummaryFailed"),
      value: counts.failed,
      tone: "text-red-500",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-6">
        <div className="flex items-center gap-2">
          {!importing && counts.failed === 0 && counts.pending === 0 && (
            <FiCheckCircle size={20} className="text-emerald-500" aria-hidden />
          )}
          <h2 className="font-nunito text-base font-semibold text-slate-800">
            {title}
          </h2>
        </div>

        {importing && (
          <div className="mt-4 flex flex-col gap-2">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2 overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className="h-full rounded-full bg-[#605BFF] transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            {waitingForRateLimit && (
              <p role="status" className="text-xs text-amber-600">
                {t("contactsImportWaitingRateLimit")}
              </p>
            )}
            <div>
              <button
                type="button"
                onClick={onStop}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {t("contactsImportStop")}
              </button>
            </div>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.key}
              className="rounded-xl border border-slate-100 px-4 py-3"
              data-testid={`import-summary-${card.key}`}
            >
              <dd className={`text-2xl font-semibold ${card.tone}`}>
                {card.value.toLocaleString()}
              </dd>
              <dt className="mt-1 text-xs text-slate-500">{card.label}</dt>
            </div>
          ))}
        </dl>

        {counts.pending > 0 && !importing && (
          <p className="mt-3 text-xs text-slate-500">
            {t("contactsImportSummaryPending", { count: counts.pending })}
          </p>
        )}

        <p className="mt-4 text-xs text-slate-400">
          {t("contactsImportSummaryNote", { label: contactsLabel })}
        </p>

        {!importing && canContinue && (
          <p className="mt-2 text-xs text-slate-400">
            {t("contactsImportRetryNote")}
          </p>
        )}
      </div>

      {!importing && (
        <div className="flex flex-wrap items-center gap-3">
          {canContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="h-10 rounded-xl bg-[#605BFF] px-5 text-sm font-semibold text-white hover:bg-[#514cf0]"
            >
              {counts.failed > 0
                ? t("contactsImportRetryFailed")
                : t("contactsImportContinueImport")}
            </button>
          )}

          {hasReportRows && (
            <button
              type="button"
              onClick={onDownloadReport}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <FiDownload size={15} aria-hidden />
              {t("contactsImportDownloadReport")}
            </button>
          )}

          <button
            type="button"
            onClick={onImportAnother}
            className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {t("contactsImportAnother")}
          </button>

          <button
            type="button"
            onClick={onViewContacts}
            className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {t("contactsImportViewContacts", { label: contactsLabel })}
          </button>
        </div>
      )}
    </div>
  );
}
