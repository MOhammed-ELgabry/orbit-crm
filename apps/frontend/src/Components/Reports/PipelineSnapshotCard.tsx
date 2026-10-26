import { useTranslation } from "react-i18next";
import CountUp from "../ui/CountUp";

import { DEAL_STAGE_LABEL_KEY } from "../Deal/dealStage";
import { useReportQuery } from "../../hooks/useReportQuery";
import {
  formatDecimalString,
  formatPercentString,
  toChartNumber,
} from "../../lib/reportFormat";
import { getPipelineSnapshot } from "../../services/reportService";
import type { DealStage } from "../../types/deal";
import type { ReportPeriod } from "../../types/report";
import ReportBarChart from "./ReportBarChart";
import ReportSection from "./ReportSection";
import StatTile from "./StatTile";

export default function PipelineSnapshotCard({
  period,
}: {
  period: ReportPeriod;
}) {
  const { t } = useTranslation();

  const query = useReportQuery(
    (signal) => getPipelineSnapshot(period, signal),
    `${period.from}|${period.to}|${period.timezone}`,
  );

  const stageLabel = (stage: string) =>
    DEAL_STAGE_LABEL_KEY[stage as DealStage]
      ? t(DEAL_STAGE_LABEL_KEY[stage as DealStage])
      : stage;

  const report = query.status === "ready" ? query.data : null;

  return (
    <ReportSection
      title={t("reportsPipelineTitle")}
      basis={t("reportsPipelineBasis")}
      state={query.status}
      onRetry={query.reload}
      isEmpty={
        report != null &&
        report.snapshot.openDealCount === 0 &&
        report.createdInRange.dealCount === 0
      }
    >
      {report && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile
              label={t("reportsOpenDeals")}
              value={<CountUp value={report.snapshot.openDealCount} />}
            />
            <StatTile
              label={t("reportsOpenValue")}
              value={<CountUp value={report.snapshot.openDealValue} />}
              hint={t("reportsNoCurrencyNote")}
            />
          </div>

          {report.snapshot.openDealCount > 0 && (
            <>
              <ReportBarChart
                ariaLabel={t("reportsValueByStage")}
                data={report.snapshot.stages.map((s) => ({
                  label: stageLabel(s.stage),
                  value: toChartNumber(s.totalValue),
                  display: formatDecimalString(s.totalValue),
                }))}
              />

              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400">
                    <th className="py-2 text-start font-medium">
                      {t("dealStage")}
                    </th>
                    <th className="py-2 text-end font-medium">
                      {t("reportsDealsLabel")}
                    </th>
                    <th className="py-2 text-end font-medium">
                      {t("reportsValueLabel")}
                    </th>
                    <th className="py-2 text-end font-medium">
                      {t("reportsShareOfValue")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.snapshot.stages.map((s) => (
                    <tr
                      key={s.stage}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="py-2 text-start text-slate-700">
                        {stageLabel(s.stage)}
                      </td>
                      <td className="py-2 text-end tabular-nums text-slate-600">
                        {s.dealCount}
                      </td>
                      <td className="py-2 text-end tabular-nums text-slate-600">
                        {formatDecimalString(s.totalValue)}
                      </td>
                      <td className="py-2 text-end tabular-nums text-slate-500">
                        {formatPercentString(s.valueSharePercent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {report.snapshot.unrecognizedStageDealCount > 0 && (
            <p className="text-xs text-amber-600">
              {t("reportsUnrecognizedStageNote", {
                count: report.snapshot.unrecognizedStageDealCount,
              })}
            </p>
          )}

          <div className="rounded-xl border border-dashed border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700">
              {t("reportsCreatedInRangeTitle")}
            </h3>
            <p className="mb-3 mt-0.5 text-xs text-slate-400">
              {t("reportsCreatedInRangeBasis")}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatTile
                label={t("reportsCreatedCount")}
                value={<CountUp value={report.createdInRange.dealCount} />}
              />
              <StatTile
                label={t("reportsCreatedValue")}
                value={<CountUp value={report.createdInRange.totalValue} />}
              />
            </div>
          </div>
        </div>
      )}
    </ReportSection>
  );
}
