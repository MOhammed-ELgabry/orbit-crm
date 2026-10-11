import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../context/AuthContext";
import LeadsOverviewCard from "../../Components/Reports/LeadsOverviewCard";
import PeriodPicker, {
  type PeriodSelection,
} from "../../Components/Reports/PeriodPicker";
import PipelineSnapshotCard from "../../Components/Reports/PipelineSnapshotCard";
import TasksOverviewCard from "../../Components/Reports/TasksOverviewCard";
import {
  buildPeriod,
  DEFAULT_REPORT_PRESET,
  getBrowserTimezone,
  presetRange,
} from "../../lib/reportPeriod";

/**
 * Reports MVP: Pipeline Snapshot, Leads Overview, Tasks Overview.
 *
 * Visibility here is UX only — each report mirrors the permission its
 * endpoint enforces (deal:read; lead:read + deal:read; task:read). The
 * backend remains the authority and answers 403 regardless of what this
 * page shows. Every section loads independently, so one failing or
 * forbidden report never blanks the others.
 */
export default function ReportsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const [selection, setSelection] = useState<PeriodSelection>({
    kind: "preset",
    preset: DEFAULT_REPORT_PRESET,
  });

  // Resolved once per mount: the time zone does not change while the page
  // is open, and a stable value keeps the query keys stable.
  const timezone = useMemo(() => getBrowserTimezone(), []);

  const period = useMemo(
    () =>
      buildPeriod(
        selection.kind === "custom"
          ? { from: selection.from, to: selection.to }
          : presetRange(selection.preset),
        timezone,
      ),
    [selection, timezone],
  );

  const canPipeline = hasPermission("deal:read");
  const canLeads = hasPermission("lead:read") && hasPermission("deal:read");
  const canTasks = hasPermission("task:read");

  if (!canPipeline && !canLeads && !canTasks) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-600">
          {t("reportsNoAccessTitle")}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {t("reportsNoAccessDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PeriodPicker
        selection={selection}
        timezone={timezone}
        onChange={setSelection}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {canPipeline && <PipelineSnapshotCard period={period} />}
        {canLeads && <LeadsOverviewCard period={period} />}
        {canTasks && <TasksOverviewCard period={period} />}
      </div>
    </div>
  );
}
