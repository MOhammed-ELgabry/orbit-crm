import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import {
  CLOSED_DEAL_STAGES,
  DEAL_STAGES,
} from '../deal/constants/deal.constants';
import { LEAD_STATUSES } from '../lead/constants/lead.constants';
import {
  CLOSED_TASK_STATUSES,
  TASK_STATUSES,
} from '../task/constants/task.constants';

import {
  LEGACY_TIMEZONE_ALIASES,
  MAX_LEAD_SOURCES_LISTED,
  REPORT_REPOSITORY,
} from './constants/report.constants';
import { ReportPeriodQueryDto } from './dto/report-query.dto';
import type {
  LeadSourceBucket,
  LeadsOverviewReport,
  PipelineSnapshotReport,
  ReportRange,
  TasksOverviewReport,
} from './interfaces/report.interfaces';
import type {
  IReportRepository,
  ReportPeriod,
} from './repository/report.repository.interface';
import { percentString } from './utils/report-math.util';
import { assertValidPeriod } from './utils/report-period.util';

const OPEN_DEAL_STAGES = DEAL_STAGES.filter(
  (stage) => !(CLOSED_DEAL_STAGES as readonly string[]).includes(stage),
);

const OPEN_TASK_STATUSES = TASK_STATUSES.filter(
  (status) => !(CLOSED_TASK_STATUSES as readonly string[]).includes(status),
);

/**
 * Report calculations. Every method receives `companyId` from the
 * verified access token (via the controller) and never from the request
 * query; the repository then scopes every statement by it.
 *
 * What counts as what is derived from the same constants the rest of the
 * product validates against (DEAL_STAGES / CLOSED_DEAL_STAGES,
 * LEAD_STATUSES, TASK_STATUSES / CLOSED_TASK_STATUSES), so a stage added
 * there flows into the reports without a second list to keep in sync.
 */
@Injectable()
export class ReportService {
  constructor(
    @Inject(REPORT_REPOSITORY)
    private readonly reportRepository: IReportRepository,
  ) {}

  /**
   * Validates the range and the time zone and resolves both to the
   * concrete period/instants the repository queries with. Rejects with
   * 400 (never 500) for any bad input.
   */
  private async resolvePeriod(
    query: ReportPeriodQueryDto,
  ): Promise<{ period: ReportPeriod; range: ReportRange }> {
    assertValidPeriod(query.from, query.to);

    const candidates = [query.timezone];
    const alias = LEGACY_TIMEZONE_ALIASES[query.timezone];

    if (alias) {
      candidates.push(alias);
    }

    for (const timezone of candidates) {
      const period: ReportPeriod = {
        from: query.from,
        to: query.to,
        timezone,
      };
      const range = await this.reportRepository.resolveRange(period);

      if (range) {
        return { period, range };
      }
    }

    throw new BadRequestException(
      'timezone is not a supported IANA time zone.',
    );
  }

  async getPipelineSnapshot(
    companyId: string,
    query: ReportPeriodQueryDto,
  ): Promise<PipelineSnapshotReport> {
    const { period, range } = await this.resolvePeriod(query);

    const aggregate = await this.reportRepository.getPipelineSnapshot(
      companyId,
      OPEN_DEAL_STAGES,
      DEAL_STAGES,
      period,
    );

    const openValueIsZero = Number(aggregate.openDealValue) === 0;
    const byStage = new Map(aggregate.openStages.map((s) => [s.stage, s]));

    return {
      snapshot: {
        asOf: aggregate.asOf,
        openDealCount: aggregate.openDealCount,
        openDealValue: aggregate.openDealValue,
        // Every open stage is listed, in pipeline order, even when empty,
        // so the funnel always has the same shape.
        stages: OPEN_DEAL_STAGES.map((stage) => {
          const row = byStage.get(stage);

          return {
            stage,
            dealCount: row?.dealCount ?? 0,
            totalValue: row?.totalValue ?? '0.00',
            valueSharePercent: row
              ? row.valueSharePercent
              : openValueIsZero
                ? null
                : '0.00',
          };
        }),
        unrecognizedStageDealCount: aggregate.unrecognizedStageDealCount,
      },
      createdInRange: aggregate.createdInRange,
      range,
    };
  }

  async getLeadsOverview(
    companyId: string,
    query: ReportPeriodQueryDto,
  ): Promise<LeadsOverviewReport> {
    const { period, range } = await this.resolvePeriod(query);

    const aggregate = await this.reportRepository.getLeadsAggregate(
      companyId,
      period,
    );

    const statusCount = new Map(
      aggregate.statusCounts.map((row) => [row.status, row.count]),
    );
    const known = LEAD_STATUSES as readonly string[];
    const unrecognizedStatusCount = aggregate.statusCounts
      .filter((row) => !known.includes(row.status))
      .reduce((sum, row) => sum + row.count, 0);

    return {
      totalLeads: aggregate.totalLeads,
      leadsWithLinkedDeal: {
        count: aggregate.leadsWithLinkedDeal,
        percentOfLeads: percentString(
          aggregate.leadsWithLinkedDeal,
          aggregate.totalLeads,
        ),
      },
      statusDistribution: LEAD_STATUSES.map((status) => ({
        status,
        count: statusCount.get(status) ?? 0,
      })),
      unrecognizedStatusCount,
      sources: this.buildSourceBuckets(aggregate.sourceCounts),
      range,
    };
  }

  /**
   * Source is free text, so: the top N named sources are listed, the long
   * tail is rolled into ONE `other` bucket, and null/blank sources form a
   * separate `unspecified` bucket. They are different `kind`s, never
   * strings, so a source a user literally typed as "other" or "unknown"
   * can never be mistaken for either synthetic bucket.
   */
  private buildSourceBuckets(
    sourceCounts: Array<{ source: string | null; count: number }>,
  ): LeadSourceBucket[] {
    const named = sourceCounts
      .filter(
        (row): row is { source: string; count: number } => row.source !== null,
      )
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));

    const unspecifiedCount = sourceCounts
      .filter((row) => row.source === null)
      .reduce((sum, row) => sum + row.count, 0);

    const listed = named.slice(0, MAX_LEAD_SOURCES_LISTED);
    const rest = named.slice(MAX_LEAD_SOURCES_LISTED);

    const buckets: LeadSourceBucket[] = listed.map((row) => ({
      kind: 'source',
      value: row.source,
      count: row.count,
    }));

    if (rest.length > 0) {
      buckets.push({
        kind: 'other',
        sourceCount: rest.length,
        count: rest.reduce((sum, row) => sum + row.count, 0),
      });
    }

    if (unspecifiedCount > 0) {
      buckets.push({ kind: 'unspecified', count: unspecifiedCount });
    }

    return buckets;
  }

  async getTasksOverview(
    companyId: string,
    query: ReportPeriodQueryDto,
  ): Promise<TasksOverviewReport> {
    const { period, range } = await this.resolvePeriod(query);

    const aggregate = await this.reportRepository.getTasksAggregate(
      companyId,
      OPEN_TASK_STATUSES,
      period,
    );

    const count = (status: string) =>
      aggregate.statusCounts
        .filter((row) => row.status === status)
        .reduce((sum, row) => sum + row.count, 0);

    const todo = count('todo');
    const inProgress = count('in_progress');
    const completed = count('completed');
    const cancelled = count('cancelled');
    const other =
      aggregate.totalDueInRange - todo - inProgress - completed - cancelled;

    // completed / (eligible - cancelled) * 100. `eligible` is every task
    // due in the range; cancelled tasks are removed from the denominator
    // exactly once, and a cancelled task can never be in the numerator.
    const denominator = aggregate.totalDueInRange - cancelled;

    return {
      totalDueInRange: aggregate.totalDueInRange,
      byStatus: {
        todo,
        in_progress: inProgress,
        completed,
        cancelled,
        other,
      },
      completionRatePercent: percentString(completed, denominator),
      withoutDueDate: {
        total: aggregate.withoutDueDateTotal,
        open: aggregate.withoutDueDateOpen,
      },
      range,
    };
  }
}
