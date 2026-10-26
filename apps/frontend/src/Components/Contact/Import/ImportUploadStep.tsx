import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ImportEncoding } from "../../../types/contactImport";
import type { ImportFileErrorState } from "../../../hooks/useContactImport";
import { downloadTextFile } from "../../../lib/contactImport/downloadFile";
import { IMPORT_LIMITS } from "../../../lib/contactImport/parseFile";
import { LuCircleAlert, LuCloudUpload, LuDownload } from "react-icons/lu";

interface ImportUploadStepProps {
  loading: boolean;
  error: ImportFileErrorState | null;
  /** The CSV is not valid UTF-8: the user must pick the encoding. */
  canChooseEncoding: boolean;
  onFile: (file: File) => void;
  onEncoding: (encoding: ImportEncoding) => void;
}

const ENCODINGS: Array<{ value: ImportEncoding; labelKey: string }> = [
  { value: "windows-1256", labelKey: "contactsImportEncoding_windows1256" },
  { value: "windows-1252", labelKey: "contactsImportEncoding_windows1252" },
  { value: "utf-8", labelKey: "contactsImportEncoding_utf8" },
];

const SAMPLE_CSV =
  String.fromCharCode(0xfeff) +
  "First name,Last name,Email,Phone,Organization\r\n" +
  "Amina,Hassan,amina@example.com,+201001234567,Acme\r\n" +
  "Omar,Said,omar@example.com,+201112345678,Globex\r\n";

export default function ImportUploadStep({
  loading,
  error,
  canChooseEncoding,
  onFile,
  onEncoding,
}: ImportUploadStepProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [encoding, setEncoding] = useState<ImportEncoding>("windows-1256");

  const pick = (file: File | undefined) => {
    if (file && !loading) onFile(file);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    pick(event.target.files?.[0]);
    // Lets the same file be chosen again after an error.
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-12 text-center transition-colors ${
          dragging
            ? "border-brand-600 bg-brand-600/5"
            : "border-slate-200 bg-white"
        }`}
      >
        <LuCloudUpload size={32} className="text-brand-600" aria-hidden />
        <p className="text-sm font-semibold text-slate-700">
          {t("contactsImportDropTitle")}
        </p>
        <p className="max-w-md text-xs text-slate-400">
          {t("contactsImportDropHint", {
            size: IMPORT_LIMITS.maxBytes / (1024 * 1024),
            rows: IMPORT_LIMITS.maxRows.toLocaleString(),
            columns: IMPORT_LIMITS.maxColumns,
          })}
        </p>

        <input
          ref={inputRef}
          type="file"
          data-testid="import-file-input"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleChange}
          className="sr-only"
          aria-label={t("contactsImportChooseFile")}
          tabIndex={-1}
        />

        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="h-10 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? t("contactsImportReading") : t("contactsImportChooseFile")}
        </button>

        <button
          type="button"
          onClick={() =>
            downloadTextFile("orbit-contacts-sample.csv", SAMPLE_CSV)
          }
          className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
        >
          <LuDownload size={13} aria-hidden />
          {t("contactsImportDownloadSample")}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          <LuCircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-3">
            <p>
              {t(`contactsImportFileError_${error.code}`, {
                limit:
                  error.code === "tooLarge"
                    ? IMPORT_LIMITS.maxBytes / (1024 * 1024)
                    : error.limit?.toLocaleString(),
              })}
            </p>

            {canChooseEncoding && (
              <div className="flex flex-col gap-2 text-slate-600">
                <p className="text-xs">{t("contactsImportEncodingBody")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="import-encoding"
                    className="text-xs font-semibold"
                  >
                    {t("contactsImportEncodingLabel")}
                  </label>
                  <select
                    id="import-encoding"
                    value={encoding}
                    onChange={(event) =>
                      setEncoding(event.target.value as ImportEncoding)
                    }
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                  >
                    {ENCODINGS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {t(item.labelKey)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onEncoding(encoding)}
                    className="h-9 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    {t("contactsImportEncodingApply")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
