/**
 * Shapes returned by the report endpoints.
 *
 * Money is ALWAYS a decimal string ("1234.50"), never a JS number: Deal.amount
 * is NUMERIC(12,2) and floats would silently drop cents on large sums. No
 * currency code or symbol is attached because the schema stores none — the
 * frontend must not invent one.
 */

/** The date range a report was computed for, echoed back so the UI can show exactly what was queried. */
export interface ReportRange {
  /** Inclusive first calendar day, as sent (YYYY-MM-DD, in `timezone`). */
  from: string;
  /** Inclusive last calendar day, as sent (YYYY-MM-DD, in `timezone`). */
  to: string;
  /** The IANA zone the day boundaries were computed in (after legacy-alias resolution). */
  timezone: string;
  /** UTC instant of the first millisecond of `from` in `timezone` (inclusive). */
  startUtc: string;
  /** UTC instant of the first millisecond AFTER `to` in `timezone` (exclusive). */
  endUtc: string;
}

export interface PipelineStageRow {
  stage: string;
  dealCount: number;
  /** Decimal string, 2 places. */
  totalValue: string;
  /** Percent of total open value (2 places), null when total open value is 0. */
  valueSharePercent: string | null;
}

export interface PipelineSnapshotReport {
  /**
   * CURRENT state of the pipeline at `asOf`, independent of the requested
   * range. A deal that is open today counts here no matter when it was
   * created.
   */
  snapshot: {
    asOf: string;
    openDealCount: number;
    /** Decimal string, 2 places. */
    openDealValue: string;
    stages: PipelineStageRow[];
    /**
     * Non-deleted deals whose stage is not one of the known pipeline
     * stages. Never counted as open or closed; reported so totals can be
     * reconciled.
     */
    unrecognizedStageDealCount: number;
  };
  /** Deals CREATED inside the requested range, in any stage (a different question from the snapshot). */
  createdInRange: {
    dealCount: number;
    /** Decimal string, 2 places. */
    totalValue: string;
  };
  range: ReportRange;
}

export type LeadSourceBucket =
  | { kind: 'source'; value: string; count: number }
  /** Leads whose source is null or blank. */
  | { kind: 'unspecified'; count: number }
  /** Sources beyond the listed top N, rolled together. Distinct from a source literally named "other". */
  | { kind: 'other'; sourceCount: number; count: number };

export interface LeadsOverviewReport {
  /** Leads CREATED inside the range (non-deleted). */
  totalLeads: number;
  /**
   * "Leads with a linked deal": distinct leads in the cohort that have at
   * least one non-deleted deal. NOT a conversion rate — a linked deal says
   * nothing about whether it was won.
   */
  leadsWithLinkedDeal: {
    count: number;
    /** Percent of totalLeads (2 places), null when there are no leads. */
    percentOfLeads: string | null;
  };
  /**
   * Each cohort lead's CURRENT status. The system keeps no status history,
   * so this is not "how many leads reached status X".
   */
  statusDistribution: Array<{ status: string; count: number }>;
  /** Leads whose status is not one of the known statuses. */
  unrecognizedStatusCount: number;
  sources: LeadSourceBucket[];
  range: ReportRange;
}

export interface TasksOverviewReport {
  /** Tasks whose dueDate falls inside the range (non-deleted). Tasks with no dueDate are never in this cohort. */
  totalDueInRange: number;
  byStatus: {
    todo: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    /** Any status outside the four known ones. Stays in the completion-rate denominator. */
    other: number;
  };
  /**
   * completed / (totalDueInRange - cancelled) * 100, 2 places; null when the
   * denominator is 0.
   */
  completionRatePercent: string | null;
  /** Tasks with no due date, across the whole company — reported separately, never part of the cohort. */
  withoutDueDate: { total: number; open: number };
  range: ReportRange;
}
