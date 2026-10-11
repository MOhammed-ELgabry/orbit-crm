/**
 * Mirrors backend/src/modules/report/interfaces/report.interfaces.ts
 * field-for-field. Keep the two in sync by hand (there is no shared-types
 * package between the apps).
 *
 * Money is ALWAYS a decimal STRING ("1234.50"): the backend sums NUMERIC in
 * the database and never sends a JS number, so cents survive. Never run
 * these through Number()/parseFloat() for display — see lib/reportFormat.ts.
 * No currency is attached because the schema stores none; do not invent one.
 */

export interface ReportPeriod {
  /** First day, inclusive, YYYY-MM-DD in `timezone`. */
  from: string;
  /** Last day, inclusive, YYYY-MM-DD in `timezone`. */
  to: string;
  /** The viewer's IANA time zone. */
  timezone: string;
}

export interface ReportRange extends ReportPeriod {
  startUtc: string;
  endUtc: string;
}

export interface PipelineStageRow {
  stage: string;
  dealCount: number;
  totalValue: string;
  valueSharePercent: string | null;
}

export interface PipelineSnapshotReport {
  snapshot: {
    asOf: string;
    openDealCount: number;
    openDealValue: string;
    stages: PipelineStageRow[];
    unrecognizedStageDealCount: number;
  };
  createdInRange: {
    dealCount: number;
    totalValue: string;
  };
  range: ReportRange;
}

export type LeadSourceBucket =
  | { kind: "source"; value: string; count: number }
  | { kind: "unspecified"; count: number }
  | { kind: "other"; sourceCount: number; count: number };

export interface LeadsOverviewReport {
  totalLeads: number;
  leadsWithLinkedDeal: {
    count: number;
    percentOfLeads: string | null;
  };
  statusDistribution: Array<{ status: string; count: number }>;
  unrecognizedStatusCount: number;
  sources: LeadSourceBucket[];
  range: ReportRange;
}

export interface TasksOverviewReport {
  totalDueInRange: number;
  byStatus: {
    todo: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    other: number;
  };
  completionRatePercent: string | null;
  withoutDueDate: { total: number; open: number };
  range: ReportRange;
}
