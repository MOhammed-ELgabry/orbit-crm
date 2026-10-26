import { useTranslation } from "react-i18next";
import CountUp from "../ui/CountUp";

import { LEAD_STATUS_LABEL_KEY } from "../Lead/leadStatus";
import { useReportQuery } from "../../hooks/useReportQuery";
import { formatPercentString } from "../../lib/reportFormat";
import { getLeadsOverview } from "../../services/reportService";
import type { LeadSourceBucket, ReportPeriod } from "../../types/report";
import ReportBarChart from "./ReportBarChart";
import ReportSection from "./ReportSection";
import StatTile from "./StatTile";

const STATUS_COLOR: Record<string, string> = {
  new: "#3B82F6",
  contacted: "#F59E0B",
  qualified: "#10B981",
  unqualified: "#94A3B8",
  lost: "#EF4444",
};

export default function LeadsOverviewCard({
  period,
}: {
  period: ReportPeriod;
}) {
  const { t } = useTranslation();

  const query = useReportQuery(
    (signal) => getLeadsOverview(period, signal),
    `${period.from}|${period.to}|${period.timezone}`,
  );

  const report = query.status === "ready" ? query.data : null;

  // The three synthetic/real kinds are rendered differently on purpose: a
  // source a user typed as "other" is a normal row, while the roll-up and
  // the null/blank bucket are labelled by the UI, never by their data.
  const sourceLabel = (bucket: LeadSourceBucket): string => {
    switch (bucket.kind) {
      case "source":
        return bucket.value;
      case "unspecified":
        return t("reportsSourceUnspecified");
      case "other":
        return t("reportsSourceOtherBucket", { count: bucket.sourceCount });
    }
  };

  return (
    <ReportSection
      title={t("reportsLeadsTitle")}
      basis={t("reportsLeadsBasis")}
      state={query.status}
      onRetry={query.reload}
      isEmpty={report !== null && report.totalLeads === 0}
    >
      {report && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile
              label={t("reportsLeadsTotal")}
              value={<CountUp value={report.totalLeads} />}
            />
            <StatTile
              label={t("reportsLeadsWithDeal")}
              value={<CountUp value={report.leadsWithLinkedDeal.count} />}
              hint={
                report.leadsWithLinkedDeal.percentOfLeads === null
                  ? t("reportsLeadsWithDealHint")
                  : `${t("reportsPercentOfLeads", {
                      value: formatPercentString(
                        report.leadsWithLinkedDeal.percentOfLeads,
                      ),
                    })} · ${t("reportsLeadsWithDealHint")}`
              }
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700">
              {t("reportsStatusDistribution")}
            </h3>
            <p className="mb-2 mt-0.5 text-xs text-slate-400">
              {t("reportsLeadStatusBasis")}
            </p>
            <ReportBarChart
              ariaLabel={t("reportsStatusDistribution")}
              data={report.statusDistribution.map((s) => ({
                label: LEAD_STATUS_LABEL_KEY[s.status]
                  ? t(LEAD_STATUS_LABEL_KEY[s.status])
                  : s.status,
                value: s.count,
                display: String(s.count),
                color: STATUS_COLOR[s.status],
              }))}
            />
            {report.unrecognizedStatusCount > 0 && (
              <p className="mt-1 text-xs text-amber-600">
                {t("reportsUnrecognizedStatusNote", {
                  count: report.unrecognizedStatusCount,
                })}
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              {t("reportsSources")}
            </h3>
            <ul className="divide-y divide-slate-50 text-sm">
              {report.sources.map((bucket, index) => (
                <li
                  key={`${bucket.kind}-${bucket.kind === "source" ? bucket.value : index}`}
                  className="flex items-center justify-between py-2"
                >
                  <span
                    className={
                      bucket.kind === "source"
                        ? "text-slate-700"
                        : "italic text-slate-500"
                    }
                  >
                    {sourceLabel(bucket)}
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {bucket.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </ReportSection>
  );
}
