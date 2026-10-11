import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { ReportRange } from '../interfaces/report.interfaces';

import type {
  IReportRepository,
  LeadsAggregate,
  PipelineSnapshotAggregate,
  ReportPeriod,
  TasksAggregate,
} from './report.repository.interface';

/**
 * Reports are aggregate-only reads, so they use parameterised raw SQL
 * (Prisma.sql — every value is a bound parameter, nothing is ever
 * concatenated into the statement) instead of loading rows into memory.
 *
 * Conventions every query below follows:
 *  - Tenant: `"companyId" = ${companyId}` and `"deletedAt" IS NULL` on EVERY
 *    table touched, including the Deal sub-select used for linked deals.
 *  - Time: createdAt/dueDate are `timestamp(3)` WITHOUT time zone holding
 *    UTC. The inclusive local-day range [from, to] becomes the half-open UTC
 *    interval [start, end) by `<local midnight> AT TIME ZONE <zone> AT TIME
 *    ZONE 'UTC'`, so PostgreSQL applies the zone's real rules on each end
 *    (a DST day is 23 or 25 hours long).
 *  - Money: NUMERIC is summed in the database and cast to text, never
 *    through a JS number.
 *  - Counts are cast to int (COUNT returns bigint, which JSON cannot carry).
 */
@Injectable()
export class ReportRepository implements IReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `b."start"` / `b."end"` as UTC `timestamp` values for the period. */
  private boundsSql(period: ReportPeriod): Prisma.Sql {
    return Prisma.sql`SELECT
        ((${period.from}::date)::timestamp AT TIME ZONE ${period.timezone}::text) AT TIME ZONE 'UTC' AS "start",
        (((${period.to}::date) + 1)::timestamp AT TIME ZONE ${period.timezone}::text) AT TIME ZONE 'UTC' AS "end"`;
  }

  async isKnownTimezone(timezone: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ known: boolean }>>(
      Prisma.sql`SELECT EXISTS (
        SELECT 1 FROM pg_timezone_names WHERE "name" = ${timezone}::text
      ) AS "known"`,
    );

    return rows[0]?.known === true;
  }

  async resolveRange(period: ReportPeriod): Promise<ReportRange | null> {
    if (!(await this.isKnownTimezone(period.timezone))) {
      return null;
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ startUtc: string; endUtc: string }>
    >(Prisma.sql`
      SELECT
        to_char(b."start", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startUtc",
        to_char(b."end", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endUtc"
      FROM (${this.boundsSql(period)}) AS b
    `);

    const row = rows[0];

    return {
      from: period.from,
      to: period.to,
      timezone: period.timezone,
      startUtc: row.startUtc,
      endUtc: row.endUtc,
    };
  }

  async getPipelineSnapshot(
    companyId: string,
    openStages: readonly string[],
    knownStages: readonly string[],
    period: ReportPeriod,
  ): Promise<PipelineSnapshotAggregate> {
    const openRows = await this.prisma.$queryRaw<
      Array<{
        stage: string;
        dealCount: number;
        totalValue: string;
        valueSharePercent: string | null;
        openDealCount: number;
        openDealValue: string;
        asOf: string;
      }>
    >(Prisma.sql`
      WITH s AS (
        SELECT d."stage" AS "stage",
               COUNT(*)::int AS "cnt",
               COALESCE(SUM(d."amount"), 0) AS "amt"
        FROM "Deal" AS d
        WHERE d."companyId" = ${companyId}
          AND d."deletedAt" IS NULL
          AND d."stage" IN (${Prisma.join(openStages)})
        GROUP BY d."stage"
      )
      SELECT s."stage" AS "stage",
             s."cnt" AS "dealCount",
             s."amt"::numeric(16,2)::text AS "totalValue",
             CASE WHEN SUM(s."amt") OVER () = 0 THEN NULL
                  ELSE ROUND(s."amt" * 100 / SUM(s."amt") OVER (), 2)::text
             END AS "valueSharePercent",
             SUM(s."cnt") OVER ()::int AS "openDealCount",
             SUM(s."amt") OVER ()::numeric(16,2)::text AS "openDealValue",
             to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf"
      FROM s
    `);

    const extraRows = await this.prisma.$queryRaw<
      Array<{
        asOf: string;
        unrecognizedStageDealCount: number;
        createdCount: number;
        createdValue: string;
      }>
    >(Prisma.sql`
      WITH b AS (${this.boundsSql(period)})
      SELECT
        to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",
        (SELECT COUNT(*)::int FROM "Deal" AS d
          WHERE d."companyId" = ${companyId}
            AND d."deletedAt" IS NULL
            AND d."stage" NOT IN (${Prisma.join(knownStages)})
        ) AS "unrecognizedStageDealCount",
        (SELECT COUNT(*)::int FROM "Deal" AS d CROSS JOIN b
          WHERE d."companyId" = ${companyId}
            AND d."deletedAt" IS NULL
            AND d."createdAt" >= b."start" AND d."createdAt" < b."end"
        ) AS "createdCount",
        (SELECT COALESCE(SUM(d."amount"), 0)::numeric(16,2)::text FROM "Deal" AS d CROSS JOIN b
          WHERE d."companyId" = ${companyId}
            AND d."deletedAt" IS NULL
            AND d."createdAt" >= b."start" AND d."createdAt" < b."end"
        ) AS "createdValue"
    `);

    const extra = extraRows[0];

    return {
      asOf: openRows[0]?.asOf ?? extra.asOf,
      openStages: openRows.map((row) => ({
        stage: row.stage,
        dealCount: row.dealCount,
        totalValue: row.totalValue,
        valueSharePercent: row.valueSharePercent,
      })),
      openDealCount: openRows[0]?.openDealCount ?? 0,
      openDealValue: openRows[0]?.openDealValue ?? '0.00',
      unrecognizedStageDealCount: extra.unrecognizedStageDealCount,
      createdInRange: {
        dealCount: extra.createdCount,
        totalValue: extra.createdValue,
      },
    };
  }

  async getLeadsAggregate(
    companyId: string,
    period: ReportPeriod,
  ): Promise<LeadsAggregate> {
    // One statement => one consistent snapshot for the total, the status
    // split and the source split. `hasDeal` is an EXISTS, so a lead with
    // several linked deals is still counted once and no join can multiply
    // the cohort.
    const rows = await this.prisma.$queryRaw<
      Array<{
        section: 'total' | 'status' | 'source';
        key: string | null;
        n: number;
        n2: number;
      }>
    >(Prisma.sql`
      WITH b AS (${this.boundsSql(period)}),
      cohort AS (
        SELECT l."status" AS "status",
               NULLIF(lower(btrim(l."source")), '') AS "sourceKey",
               EXISTS (
                 SELECT 1 FROM "Deal" AS d
                 WHERE d."leadId" = l."id"
                   AND d."companyId" = l."companyId"
                   AND d."deletedAt" IS NULL
               ) AS "hasDeal"
        FROM "Lead" AS l CROSS JOIN b
        WHERE l."companyId" = ${companyId}
          AND l."deletedAt" IS NULL
          AND l."createdAt" >= b."start" AND l."createdAt" < b."end"
      )
      SELECT 'total'::text AS "section", NULL::text AS "key",
             COUNT(*)::int AS "n",
             (COUNT(*) FILTER (WHERE "hasDeal"))::int AS "n2"
      FROM cohort
      UNION ALL
      SELECT 'status'::text, "status", COUNT(*)::int, 0 FROM cohort GROUP BY "status"
      UNION ALL
      SELECT 'source'::text, "sourceKey", COUNT(*)::int, 0 FROM cohort GROUP BY "sourceKey"
    `);

    const total = rows.find((row) => row.section === 'total');

    return {
      totalLeads: total?.n ?? 0,
      leadsWithLinkedDeal: total?.n2 ?? 0,
      statusCounts: rows
        .filter((row) => row.section === 'status')
        .map((row) => ({ status: row.key ?? '', count: row.n })),
      sourceCounts: rows
        .filter((row) => row.section === 'source')
        .map((row) => ({ source: row.key, count: row.n })),
    };
  }

  async getTasksAggregate(
    companyId: string,
    openStatuses: readonly string[],
    period: ReportPeriod,
  ): Promise<TasksAggregate> {
    const rows = await this.prisma.$queryRaw<
      Array<{ section: 'status' | 'nodue'; key: string | null; n: number }>
    >(Prisma.sql`
      WITH b AS (${this.boundsSql(period)})
      SELECT 'status'::text AS "section", t."status" AS "key", COUNT(*)::int AS "n"
      FROM "Task" AS t CROSS JOIN b
      WHERE t."companyId" = ${companyId}
        AND t."deletedAt" IS NULL
        AND t."dueDate" >= b."start" AND t."dueDate" < b."end"
      GROUP BY t."status"
      UNION ALL
      SELECT 'nodue'::text, 'total'::text, COUNT(*)::int
      FROM "Task" AS t
      WHERE t."companyId" = ${companyId}
        AND t."deletedAt" IS NULL
        AND t."dueDate" IS NULL
      UNION ALL
      SELECT 'nodue'::text, 'open'::text, COUNT(*)::int
      FROM "Task" AS t
      WHERE t."companyId" = ${companyId}
        AND t."deletedAt" IS NULL
        AND t."dueDate" IS NULL
        AND t."status" IN (${Prisma.join(openStatuses)})
    `);

    const statusCounts = rows
      .filter((row) => row.section === 'status')
      .map((row) => ({ status: row.key ?? '', count: row.n }));

    const noDue = (key: 'total' | 'open') =>
      rows.find((row) => row.section === 'nodue' && row.key === key)?.n ?? 0;

    return {
      totalDueInRange: statusCounts.reduce((sum, row) => sum + row.count, 0),
      statusCounts,
      withoutDueDateTotal: noDue('total'),
      withoutDueDateOpen: noDue('open'),
    };
  }
}
