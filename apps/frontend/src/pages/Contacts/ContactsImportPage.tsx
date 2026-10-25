import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiArrowLeft } from "react-icons/fi";

import { useAuth } from "../../context/AuthContext";
import { useContactImport } from "../../hooks/useContactImport";
import type { ImportPhase } from "../../hooks/useContactImport";
import ImportUploadStep from "../../Components/Contact/Import/ImportUploadStep";
import ImportMappingStep from "../../Components/Contact/Import/ImportMappingStep";
import ImportReviewStep from "../../Components/Contact/Import/ImportReviewStep";
import ImportSummaryStep from "../../Components/Contact/Import/ImportSummaryStep";
import {
  rowKindLabelKey,
  rowReason,
} from "../../Components/Contact/Import/importMessages";
import { downloadTextFile } from "../../lib/contactImport/downloadFile";
import {
  ERROR_REPORT_KINDS,
  buildErrorReportCsv,
} from "../../lib/contactImport/importRows";
import { trackEvent } from "../../lib/posthog";

const STEPS: Array<{ phase: ImportPhase; labelKey: string }> = [
  { phase: "upload", labelKey: "contactsImportStepUpload" },
  { phase: "mapping", labelKey: "contactsImportStepMap" },
  { phase: "review", labelKey: "contactsImportStepReview" },
  { phase: "result", labelKey: "contactsImportStepResult" },
];

/**
 * Import contacts from an Excel (.xlsx) or CSV file exported from another CRM.
 * The file is read in the browser; only parsed rows reach the API
 * (POST /contacts/import/validate and POST /contacts/import).
 */
export default function ContactsImportPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const contactsLabel = t("contacts");
  const canImport = hasPermission("contact:create");

  const importer = useContactImport();
  const { importing, counts, cancel } = importer;

  // Closing the tab in the middle of an import would leave a partial result.
  useEffect(() => {
    if (!importing) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [importing]);

  // Leaving the page stops sending further chunks.
  useEffect(() => cancel, [cancel]);

  // Counts only (never names, emails or file content) — same rule as the other trackEvent calls.
  const wasImporting = useRef(false);
  useEffect(() => {
    if (wasImporting.current && !importing) {
      trackEvent("contacts_import_finished", {
        created: counts.created,
        skipped: counts.skipped,
        rejected: counts.rejected,
        failed: counts.failed,
      });
    }

    wasImporting.current = importing;
  }, [importing, counts]);

  const goToContacts = () => navigate("/dashboard/contacts");

  const downloadReport = () => {
    if (!importer.parsed) return;

    const csv = buildErrorReportCsv(
      importer.parsed,
      importer.derived,
      (row) => ({
        status: t(rowKindLabelKey(row.kind)),
        reason: rowReason(t, row),
      }),
      {
        row: t("contactsImportReportRow"),
        status: t("contactsImportReportStatus"),
        reason: t("contactsImportReportReason"),
      },
    );

    downloadTextFile("orbit-contacts-import-report.csv", csv);
  };

  const stepIndex = STEPS.findIndex((step) => step.phase === importer.phase);

  return (
    <div
      dir={i18n.language === "ar" ? "rtl" : "ltr"}
      className="flex flex-col gap-4"
    >
      <button
        type="button"
        onClick={goToContacts}
        className="flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600"
      >
        <FiArrowLeft size={14} className="rtl:rotate-180" aria-hidden />
        {t("backToList", { label: contactsLabel })}
      </button>

      <div>
        <h1 className="font-nunito text-lg font-semibold text-slate-800">
          {t("contactsImportTitle", { label: contactsLabel })}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {t("contactsImportSubtitle", { label: contactsLabel })}
        </p>
      </div>

      {!canImport ? (
        <div
          role="alert"
          className="rounded-2xl border border-slate-100 bg-white px-4 py-12 text-center"
        >
          <p className="text-sm font-medium text-slate-600">
            {t("contactsImportNoPermission", { label: contactsLabel })}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {t("contactsImportNoPermissionHint")}
          </p>
        </div>
      ) : (
        <>
          <ol
            aria-label={t("contactsImportStepsAria")}
            className="flex flex-wrap items-center gap-2 text-xs"
          >
            {STEPS.map((step, index) => (
              <li
                key={step.phase}
                aria-current={index === stepIndex ? "step" : undefined}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold ${
                  index === stepIndex
                    ? "bg-[#605BFF] text-white"
                    : index < stepIndex
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                <span>{index + 1}</span>
                <span>{t(step.labelKey)}</span>
              </li>
            ))}
          </ol>

          {importer.phase === "upload" && (
            <ImportUploadStep
              loading={importer.loadingFile}
              error={importer.fileError}
              canChooseEncoding={importer.canChooseEncoding}
              onFile={(file) => void importer.loadFile(file)}
              onEncoding={(encoding) => void importer.changeEncoding(encoding)}
            />
          )}

          {importer.phase === "mapping" && importer.parsed && (
            <ImportMappingStep
              parsed={importer.parsed}
              mapping={importer.mapping}
              splitMode={importer.splitMode}
              onColumnChange={importer.setColumn}
              onSplitMode={importer.setSplitMode}
              onEncoding={(encoding) => void importer.changeEncoding(encoding)}
              onBack={() => importer.goTo("upload")}
              onContinue={importer.continueToReview}
            />
          )}

          {importer.phase === "review" && (
            <ImportReviewStep
              rows={importer.derived}
              checking={importer.checking}
              checkFailed={importer.checkFailed}
              onRetryCheck={importer.retryCheck}
              onEditName={importer.editRowName}
              onBack={() => importer.goTo("mapping")}
              onImport={() => void importer.startImport()}
            />
          )}

          {importer.phase === "result" && (
            <ImportSummaryStep
              counts={importer.counts}
              importing={importer.importing}
              importFailed={importer.importFailed}
              waitingForRateLimit={importer.waitingForRateLimit}
              progress={importer.progress}
              contactsLabel={contactsLabel}
              hasReportRows={importer.derived.some((row) =>
                (ERROR_REPORT_KINDS as readonly string[]).includes(row.kind),
              )}
              onStop={importer.cancel}
              onContinue={() => void importer.startImport()}
              onDownloadReport={downloadReport}
              onImportAnother={importer.reset}
              onViewContacts={goToContacts}
            />
          )}
        </>
      )}
    </div>
  );
}
