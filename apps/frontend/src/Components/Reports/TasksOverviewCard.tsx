import { useTranslation } from "react-i18next";

import { TASK_STATUS_LABEL_KEY } from "../Task/taskMeta";
import { useReportQuery } from "../../hooks/useReportQuery";
import { formatPercentString } from "../../lib/reportFormat";
import { getTasksOverview } from "../../services/reportService";
import type { ReportPeriod } from "../../types/report";
import type { TaskStatus } from "../../types/task";
import ReportBarChart from "./ReportBarChart";
import ReportSection from "./ReportSection";
import StatTile from "./StatTile";

const STATUS_ORDER: TaskStatus[] = [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
];

const STATUS_COLOR: Record<string, string> = {
  todo: "#94A3B8",
  in_progress: "#3B82F6",
  completed: "#10B981",
  cancelled: "#EF4444",
  other: "#CBD5E1",
};

export default function TasksOverviewCard({
  period,
}: {
  period: ReportPeriod;
}) {
  const { t } = useTranslation();

  const query = useReportQuery(
    (signal) => getTasksOverview(period, signal),
    `${period.from}|${period.to}|${period.timezone}`,
  );

  const report = query.status === "ready" ? query.data : null;

  return (
    <ReportSection
      title={t("reportsTasksTitle")}
      basis={t("reportsTasksBasis")}
      state={query.status}
      onRetry={query.reload}
      isEmpty={
        report !== null &&
        report.totalDueInRange === 0 &&
        report.withoutDueDate.total === 0
      }
    >
      {report && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile
              label={t("reportsTasksDue")}
              value={report.totalDueInRange}
            />
            <StatTile
              label={t("reportsCompletionRate")}
              value={formatPercentString(report.completionRatePercent)}
              hint={
                report.completionRatePercent === null
                  ? t("reportsCompletionRateNotAvailable")
                  : t("reportsCompletionRateHint")
              }
            />
          </div>

          {report.totalDueInRange > 0 ? (
            <ReportBarChart
              ariaLabel={t("reportsTasksStatusBreakdown")}
              data={[
                ...STATUS_ORDER.map((status) => ({
                  label: t(TASK_STATUS_LABEL_KEY[status]),
                  value: report.byStatus[status],
                  display: String(report.byStatus[status]),
                  color: STATUS_COLOR[status],
                })),
                ...(report.byStatus.other > 0
                  ? [
                      {
                        label: t("reportsTaskStatusOther"),
                        value: report.byStatus.other,
                        display: String(report.byStatus.other),
                        color: STATUS_COLOR.other,
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <p className="text-sm text-slate-500">
              {t("reportsTasksNoneDueInPeriod")}
            </p>
          )}

          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-start">
            <h3 className="text-sm font-semibold text-slate-700">
              {t("reportsTasksWithoutDueDate")}:{" "}
              <span className="tabular-nums">
                {report.withoutDueDate.total}
              </span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {t("reportsTasksWithoutDueDateHint", {
                open: report.withoutDueDate.open,
                total: report.withoutDueDate.total,
              })}
            </p>
          </div>
        </div>
      )}
    </ReportSection>
  );
}
