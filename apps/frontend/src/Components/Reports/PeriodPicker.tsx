import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  REPORT_PRESETS,
  type ReportPreset,
  validateRange,
  MAX_REPORT_RANGE_DAYS,
} from "../../lib/reportPeriod";

export type PeriodSelection =
  | { kind: "preset"; preset: ReportPreset }
  | { kind: "custom"; from: string; to: string };

interface PeriodPickerProps {
  selection: PeriodSelection;
  timezone: string;
  onChange: (selection: PeriodSelection) => void;
}

const PRESET_LABEL_KEY: Record<ReportPreset, string> = {
  last7: "reportsPresetLast7",
  last30: "reportsPresetLast30",
  thisMonth: "reportsPresetThisMonth",
  lastMonth: "reportsPresetLastMonth",
};

/**
 * Preset ranges plus a custom from/to. A custom range is only applied
 * after the same validation the backend performs, so an invalid range
 * shows an inline message instead of triggering a request that would 400.
 */
export default function PeriodPicker({
  selection,
  timezone,
  onChange,
}: PeriodPickerProps) {
  const { t } = useTranslation();

  const [from, setFrom] = useState(
    selection.kind === "custom" ? selection.from : "",
  );
  const [to, setTo] = useState(selection.kind === "custom" ? selection.to : "");
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const problem = validateRange(from, to);

    if (problem === "incomplete") {
      setError(t("reportsRangeIncomplete"));
      return;
    }

    if (problem === "order") {
      setError(t("reportsRangeInvalidOrder"));
      return;
    }

    if (problem === "tooLong") {
      setError(t("reportsRangeTooLong", { days: MAX_REPORT_RANGE_DAYS }));
      return;
    }

    setError(null);
    onChange({ kind: "custom", from, to });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="me-1 text-xs font-medium text-slate-500">
          {t("reportsPeriodLabel")}
        </span>

        {REPORT_PRESETS.map((preset) => {
          const active =
            selection.kind === "preset" && selection.preset === preset;

          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setError(null);
                onChange({ kind: "preset", preset });
              }}
              className={`h-9 rounded-xl px-3 text-sm font-medium ${
                active
                  ? "bg-[#605BFF] text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t(PRESET_LABEL_KEY[preset])}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("reportsFromLabel")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-500">
          {t("reportsToLabel")}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300"
          />
        </label>

        <button
          type="button"
          onClick={apply}
          className={`h-9 rounded-xl px-4 text-sm font-semibold ${
            selection.kind === "custom"
              ? "bg-[#605BFF] text-white hover:bg-[#514cf0]"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {t("reportsApply")}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}

      <p className="text-xs text-slate-400">
        {t("reportsTimezoneNote", { timezone })}
      </p>
    </div>
  );
}
