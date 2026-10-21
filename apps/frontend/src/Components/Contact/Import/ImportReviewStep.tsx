import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertCircle, FiAlertTriangle } from "react-icons/fi";

import type {
  DerivedImportRow,
  ImportRowKind,
} from "../../../types/contactImport";
import { rowKindLabelKey, rowReason } from "./importMessages";

interface ImportReviewStepProps {
  rows: DerivedImportRow[];
  checking: boolean;
  checkFailed: boolean;
  onRetryCheck: () => void;
  onEditName: (
    rowNumber: number,
    patch: { firstName?: string; lastName?: string },
  ) => void;
  onBack: () => void;
  onImport: () => void;
}

type Filter = "all" | "valid" | "duplicate" | "invalid";

const PAGE_SIZE = 25;

const KIND_BADGE: Record<ImportRowKind, string> = {
  valid: "bg-emerald-50 text-emerald-600",
  duplicate: "bg-amber-50 text-amber-600",
  invalid: "bg-red-50 text-red-600",
  unchecked: "bg-slate-100 text-slate-500",
  created: "bg-emerald-50 text-emerald-600",
  failed: "bg-red-50 text-red-600",
};

const nameInputClass =
  "h-8 w-full min-w-[7rem] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-300";

interface NameCellProps {
  row: DerivedImportRow;
  field: "firstName" | "lastName";
  label: string;
  onCommit: (value: string) => void;
}

/** Plain text, or an input when the name was split from a full-name cell (so it can be corrected). */
function NameCell({ row, field, label, onCommit }: NameCellProps) {
  const value = row.draft.values[field] ?? "";

  if (!row.draft.nameFromFullName) {
    return (
      <span dir="auto" className="text-slate-700">
        {value || "—"}
      </span>
    );
  }

  return (
    <input
      type="text"
      dir="auto"
      defaultValue={value}
      aria-label={`${label} (${row.rowNumber})`}
      onBlur={(event) => {
        if (event.target.value.trim() !== value) {
          onCommit(event.target.value);
        }
      }}
      className={nameInputClass}
    />
  );
}

export default function ImportReviewStep({
  rows,
  checking,
  checkFailed,
  onRetryCheck,
  onEditName,
  onBack,
  onImport,
}: ImportReviewStepProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  const count = (kind: ImportRowKind) =>
    rows.filter((row) => row.kind === kind).length;

  const validCount = count("valid");
  const duplicateCount = count("duplicate");
  const invalidCount = count("invalid");

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.kind === filter)),
    [rows, filter],
  );

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = visible.slice(
    (current - 1) * PAGE_SIZE,
    current * PAGE_SIZE,
  );

  const chooseFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  const canImport = !checking && !checkFailed && validCount > 0;

  const chips: Array<{ id: Filter; label: string; badge: string }> = [
    {
      id: "all",
      label: t("contactsImportFilterAll", { count: rows.length }),
      badge: "bg-slate-100 text-slate-600",
    },
    {
      id: "valid",
      label: t("contactsImportCountValid", { count: validCount }),
      badge: KIND_BADGE.valid,
    },
    {
      id: "duplicate",
      label: t("contactsImportCountDuplicate", { count: duplicateCount }),
      badge: KIND_BADGE.duplicate,
    },
    {
      id: "invalid",
      label: t("contactsImportCountInvalid", { count: invalidCount }),
      badge: KIND_BADGE.invalid,
    },
  ];

  const renderMessages = (row: DerivedImportRow) => {
    const reason = rowReason(t, row);

    return (
      <div className="flex flex-col gap-1 text-xs">
        {reason && (
          <span
            dir="auto"
            className={
              row.kind === "duplicate" ? "text-amber-600" : "text-red-500"
            }
          >
            {reason}
          </span>
        )}
        {row.warnings.map((warning) => (
          <span key={warning} className="text-slate-400">
            {t(`contactsImportWarning_${warning}`, { defaultValue: warning })}
          </span>
        ))}
        {row.draft.nameFromFullName && (
          <span dir="auto" className="text-slate-400">
            {t("contactsImportNameFromFull", { name: row.draft.fullName })}
          </span>
        )}
      </div>
    );
  };

  const badge = (row: DerivedImportRow) => (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${KIND_BADGE[row.kind]}`}
    >
      {t(rowKindLabelKey(row.kind))}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5">
        <h2 className="font-nunito text-base font-semibold text-slate-800">
          {t("contactsImportReviewTitle")}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {t("contactsImportReviewHint")}
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="group">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={filter === chip.id}
              onClick={() => chooseFilter(chip.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${chip.badge} ${
                filter === chip.id ? "ring-2 ring-[#605BFF]/40" : ""
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {checking && (
          <p role="status" className="mt-3 text-xs text-slate-500">
            {t("contactsImportChecking")}
          </p>
        )}

        {checkFailed && (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            <FiAlertCircle size={16} aria-hidden />
            <span>{t("contactsImportCheckFailed")}</span>
            <button
              type="button"
              onClick={onRetryCheck}
              className="text-xs font-semibold underline"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {validCount === 0 && !checking && !checkFailed && (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 text-sm text-amber-600"
          >
            <FiAlertTriangle size={15} aria-hidden />
            {t("contactsImportNothingToImport")}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white">
        {pageRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">—</p>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-start sm:table">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="px-4 py-3 text-start font-medium">
                    {t("contactsImportRowNumber")}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">
                    {t("contactsImportField_firstName")}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">
                    {t("contactsImportField_lastName")}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">
                    {t("contactsImportField_email")}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">
                    {t("contactsImportRowResult")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className="border-b border-slate-50 align-top text-sm last:border-0"
                  >
                    <td className="px-4 py-3 text-slate-400">
                      {row.rowNumber}
                    </td>
                    <td className="px-4 py-3">
                      <NameCell
                        row={row}
                        field="firstName"
                        label={t("contactsImportField_firstName")}
                        onCommit={(value) =>
                          onEditName(row.rowNumber, { firstName: value })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <NameCell
                        row={row}
                        field="lastName"
                        label={t("contactsImportField_lastName")}
                        onCommit={(value) =>
                          onEditName(row.rowNumber, { lastName: value })
                        }
                      />
                    </td>
                    <td dir="auto" className="px-4 py-3 text-slate-500">
                      {row.draft.values.email || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        {badge(row)}
                        {renderMessages(row)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="divide-y divide-slate-50 sm:hidden">
              {pageRows.map((row) => (
                <div
                  key={row.rowNumber}
                  className="flex flex-col gap-2 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">
                      {t("contactsImportRowNumber")} {row.rowNumber}
                    </span>
                    {badge(row)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <NameCell
                      row={row}
                      field="firstName"
                      label={t("contactsImportField_firstName")}
                      onCommit={(value) =>
                        onEditName(row.rowNumber, { firstName: value })
                      }
                    />
                    <NameCell
                      row={row}
                      field="lastName"
                      label={t("contactsImportField_lastName")}
                      onCommit={(value) =>
                        onEditName(row.rowNumber, { lastName: value })
                      }
                    />
                  </div>
                  <span dir="auto" className="truncate text-xs text-slate-500">
                    {row.draft.values.email || "—"}
                  </span>
                  {renderMessages(row)}
                </div>
              ))}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>{visible.length.toLocaleString()}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
                aria-label={t("contactsImportPrevPage")}
                className="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40"
              >
                <span aria-hidden className="inline-block rtl:rotate-180">
                  &larr;
                </span>
              </button>
              <span>
                {current} / {totalPages}
              </span>
              <button
                type="button"
                disabled={current >= totalPages}
                onClick={() => setPage(current + 1)}
                aria-label={t("contactsImportNextPage")}
                className="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-40"
              >
                <span aria-hidden className="inline-block rtl:rotate-180">
                  &rarr;
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

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
          disabled={!canImport}
          onClick={onImport}
          className="h-10 rounded-xl bg-[#605BFF] px-5 text-sm font-semibold text-white hover:bg-[#514cf0] disabled:opacity-50"
        >
          {t("contactsImportStartButton", { count: validCount })}
        </button>
      </div>
    </div>
  );
}
