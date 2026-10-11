import type { ReportRange } from '../interfaces/report.interfaces';

/** A validated, time-zone-resolved inclusive day range. `timezone` is the name the database accepted. */
export interface ReportPeriod {
  from: string;
  to: string;
  timezone: string;
}

export interface PipelineStageAggregate {
  stage: string;
  dealCount: number;
  totalValue: string;
  valueSharePercent: string | null;
}

export interface PipelineSnapshotAggregate {
  asOf: string;
  /** One row per open stage that has at least one deal. */
  openStages: PipelineStageAggregate[];
  openDealCount: number;
  openDealValue: string;
  unrecognizedStageDealCount: number;
  createdInRange: { dealCount: number; totalValue: string };
}

export interface LeadsAggregate {
  totalLeads: number;
  leadsWithLinkedDeal: number;
  /** Raw status -> count, exactly as stored. */
  statusCounts: Array<{ status: string; count: number }>;
  /** Lower-cased, trimmed source -> count; `source: null` is null/blank. */
  sourceCounts: Array<{ source: string | null; count: number }>;
}

export interface TasksAggregate {
  totalDueInRange: number;
  /** Raw status -> count for the due-in-range cohort. */
  statusCounts: Array<{ status: string; count: number }>;
  withoutDueDateTotal: number;
  withoutDueDateOpen: number;
}

/**
 * Read-only aggregate queries. Every method takes `companyId` as its
 * first argument — callers pass the id from the verified token, and
 * every query filters by it (and by `deletedAt IS NULL`) itself.
 */
export interface IReportRepository {
  /**
   * Resolves the inclusive day range to its UTC instants using the
   * database's own time-zone rules (so DST days are 23/25 hours long).
   * Returns null when the database does not recognise `timezone`.
   */
  resolveRange(period: ReportPeriod): Promise<ReportRange | null>;

  /** Whether the database recognises this IANA zone name. */
  isKnownTimezone(timezone: string): Promise<boolean>;

  getPipelineSnapshot(
    companyId: string,
    openStages: readonly string[],
    knownStages: readonly string[],
    period: ReportPeriod,
  ): Promise<PipelineSnapshotAggregate>;

  getLeadsAggregate(
    companyId: string,
    period: ReportPeriod,
  ): Promise<LeadsAggregate>;

  getTasksAggregate(
    companyId: string,
    openStatuses: readonly string[],
    period: ReportPeriod,
  ): Promise<TasksAggregate>;
}
