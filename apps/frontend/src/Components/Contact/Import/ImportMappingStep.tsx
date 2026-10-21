import { useTranslation } from "react-i18next";
import { FiAlertTriangle } from "react-icons/fi";

import type {
  ColumnMapping,
  ImportEncoding,
  ImportField,
  NameSplitMode,
  ParsedImportFile,
} from "../../../types/contactImport";
import { IMPORT_FIELDS } from "../../../types/contactImport";
import {
  columnTitle,
  missingRequiredFields,
} from "../../../lib/contactImport/columnMapping";
import { importFieldLabelKey } from "./importMessages";

interface ImportMappingStepProps {
  parsed: ParsedImportFile;
  mapping: ColumnMapping;
  splitMode: NameSplitMode;
  onColumnChange: (column: number, field: ImportField | null) => void;
  onSplitMode: (mode: NameSplitMode) => void;
  onEncoding: (encoding: ImportEncoding) => void;
  onBack: () => void;
  onContinue: () => void;
}

const selectClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300";

const NUMERIC_SENSITIVE: ImportField[] = ["phone", "mobile", "postalCode"];

const ENCODING_OPTIONS: Array<{ value: ImportEncoding; labelKey: string }> = [
  { value: "utf-8", labelKey: "contactsImportEncoding_utf8" },
  { value: "windows-1256", labelKey: "contactsImportEncoding_windows1256" },
  { value: "windows-1252", labelKey: "contactsImportEncoding_windows1252" },
];

const sampleOf = (parsed: ParsedImportFile, column: number): string =>
  parsed.rows
    .map((row) => row[column])
    .filter((value) => value && value.length > 0)
    .slice(0, 3)
    .join(" · ");

export default function ImportMappingStep({
  parsed,
  mapping,
  splitMode,
  onColumnChange,
  onSplitMode,
  onEncoding,
  onBack,
  onContinue,
}: ImportMappingStepProps) {
  const { t } = useTranslation();

  const missing = missingRequiredFields(mapping);
  const usesFullName = mapping.includes("fullName");

  const numericWarnings = parsed.numericColumns.filter((column) => {
    const field = mapping[column];
    return field !== null && NUMERIC_SENSITIVE.includes(field);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5">
        <h2 className="font-nunito text-base font-semibold text-slate-800">
          {t("contactsImportMapTitle")}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {t("contactsImportMapHint")}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
          <span dir="auto">
            {t("contactsImportFileInfo", {
              name: parsed.fileName,
              rows: parsed.rows.length.toLocaleString(),
              columns: parsed.headers.length,
            })}
          </span>
          {parsed.sheetName && (
            <span dir="auto">
              {t("contactsImportSheet", { name: parsed.sheetName })}
            </span>
          )}
          {parsed.format === "csv" && parsed.encoding && (
            <label className="flex items-center gap-2">
              {t("contactsImportEncodingLabel")}
              <select
                value={parsed.encoding}
                onChange={(event) =>
                  onEncoding(event.target.value as ImportEncoding)
                }
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
              >
                {ENCODING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 divide-y divide-slate-50 rounded-xl border border-slate-100">
          <div className="hidden grid-cols-[1fr_1fr_16rem] gap-4 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-400 sm:grid">
            <span>{t("contactsImportColumn")}</span>
            <span>{t("contactsImportSampleValues")}</span>
            <span>{t("contactsImportMapsTo")}</span>
          </div>

          {parsed.headers.map((header, column) => {
            const title = columnTitle(header, column);

            return (
              <div
                key={column}
                className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_16rem] sm:items-center sm:gap-4"
              >
                <span
                  dir="auto"
                  className="truncate text-sm font-medium text-slate-700"
                >
                  {title}
                </span>
                <span dir="auto" className="truncate text-xs text-slate-400">
                  {sampleOf(parsed, column) || "—"}
                </span>
                <select
                  aria-label={t("contactsImportMapColumnAria", {
                    column: title,
                  })}
                  value={mapping[column] ?? ""}
                  onChange={(event) =>
                    onColumnChange(
                      column,
                      (event.target.value || null) as ImportField | null,
                    )
                  }
                  className={selectClass}
                >
                  <option value="">{t("contactsImportIgnore")}</option>
                  {IMPORT_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {t(importFieldLabelKey(field))}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {usesFullName && (
          <fieldset className="mt-4 flex flex-col gap-2 text-sm text-slate-600">
            <legend className="text-xs font-semibold text-slate-700">
              {t("contactsImportSplitTitle")}
            </legend>
            {(["lastWord", "firstWord"] as const).map((mode) => (
              <label key={mode} className="flex items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="import-split-mode"
                  value={mode}
                  checked={splitMode === mode}
                  onChange={() => onSplitMode(mode)}
                  className="mt-0.5"
                />
                <span>{t(`contactsImportSplit_${mode}`)}</span>
              </label>
            ))}
            <p className="text-xs text-slate-400">
              {t("contactsImportSplitHint")}
            </p>
          </fieldset>
        )}
      </div>

      {missing.length > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700"
        >
          <FiAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {t("contactsImportRequiredNote")}{" "}
            {t("contactsImportMissingRequired", {
              fields: missing
                .map((field) => t(importFieldLabelKey(field)))
                .join(", "),
            })}
          </span>
        </p>
      )}

      {numericWarnings.map((column) => (
        <p
          key={column}
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700"
        >
          <FiAlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span dir="auto">
            {t("contactsImportNumericWarning", {
              column: columnTitle(parsed.headers[column], column),
            })}
          </span>
        </p>
      ))}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          {t("contactsImportBackBtn")}
        </button>
        <button
          type="button"
          disabled={missing.length > 0}
          onClick={onContinue}
          className="h-10 rounded-xl bg-[#605BFF] px-5 text-sm font-semibold text-white hover:bg-[#514cf0] disabled:opacity-50"
        >
          {t("contactsImportContinue")}
        </button>
      </div>
    </div>
  );
}
