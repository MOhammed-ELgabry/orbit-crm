/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- jest mock call records are untyped (`any`) by design */
import { BadRequestException } from '@nestjs/common';

import { ReportService } from './report.service';
import type { ReportRange } from './interfaces/report.interfaces';
import type {
  IReportRepository,
  ReportPeriod,
} from './repository/report.repository.interface';

const query = {
  from: '2026-10-01',
  to: '2026-10-31',
  timezone: 'Africa/Cairo',
};

const rangeFor = (period: ReportPeriod): ReportRange => ({
  ...period,
  startUtc: '2026-09-30T21:00:00.000Z',
  endUtc: '2026-10-31T22:00:00.000Z',
});

describe('ReportService', () => {
  let mocks: Record<keyof IReportRepository, jest.Mock>;
  let service: ReportService;

  beforeEach(() => {
    mocks = {
      resolveRange: jest.fn((period: ReportPeriod) =>
        Promise.resolve(rangeFor(period)),
      ),
      isKnownTimezone: jest.fn(),
      getPipelineSnapshot: jest.fn(),
      getLeadsAggregate: jest.fn(),
      getTasksAggregate: jest.fn(),
    };
    service = new ReportService(mocks);
  });

  describe('input validation (never reaches the data queries)', () => {
    it('rejects an unknown time zone with 400', async () => {
      mocks.resolveRange.mockResolvedValue(null);

      await expect(
        service.getTasksOverview('c1', { ...query, timezone: 'Mars/Olympus' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.getTasksAggregate).not.toHaveBeenCalled();
    });

    it('rejects an impossible date or inverted range with 400', async () => {
      await expect(
        service.getLeadsOverview('c1', { ...query, from: '2026-02-30' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.getLeadsOverview('c1', {
          ...query,
          from: '2026-10-31',
          to: '2026-10-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.resolveRange).not.toHaveBeenCalled();
      expect(mocks.getLeadsAggregate).not.toHaveBeenCalled();
    });

    it('maps a legacy browser zone name to its canonical zone when the database lacks the legacy one', async () => {
      mocks.resolveRange.mockImplementation((period) =>
        Promise.resolve(
          period.timezone === 'Asia/Kolkata' ? rangeFor(period) : null,
        ),
      );
      mocks.getTasksAggregate.mockResolvedValue({
        totalDueInRange: 0,
        statusCounts: [],
        withoutDueDateTotal: 0,
        withoutDueDateOpen: 0,
      });

      const report = await service.getTasksOverview('c1', {
        ...query,
        timezone: 'Asia/Calcutta',
      });

      expect(report.range.timezone).toBe('Asia/Kolkata');
      expect(mocks.getTasksAggregate).toHaveBeenCalledWith(
        'c1',
        expect.anything(),
        expect.objectContaining({ timezone: 'Asia/Kolkata' }),
      );
    });

    it('prefers the name the browser sent when the database knows it', async () => {
      mocks.getTasksAggregate.mockResolvedValue({
        totalDueInRange: 0,
        statusCounts: [],
        withoutDueDateTotal: 0,
        withoutDueDateOpen: 0,
      });

      const report = await service.getTasksOverview('c1', {
        ...query,
        timezone: 'Asia/Calcutta',
      });

      expect(report.range.timezone).toBe('Asia/Calcutta');
    });
  });

  describe('R1 pipeline snapshot', () => {
    it('derives the open stages from the product constants (closed stages excluded) and zero-fills in pipeline order', async () => {
      mocks.getPipelineSnapshot.mockResolvedValue({
        asOf: '2026-10-10T00:00:00.000Z',
        openStages: [
          {
            stage: 'proposal',
            dealCount: 2,
            totalValue: '1500.50',
            valueSharePercent: '60.00',
          },
          {
            stage: 'new',
            dealCount: 1,
            totalValue: '1000.00',
            valueSharePercent: '40.00',
          },
        ],
        openDealCount: 3,
        openDealValue: '2500.50',
        unrecognizedStageDealCount: 1,
        createdInRange: { dealCount: 4, totalValue: '9999999999.99' },
      });

      const report = await service.getPipelineSnapshot('c1', query);

      const [, openStages, knownStages] =
        mocks.getPipelineSnapshot.mock.calls[0];
      expect(openStages).toEqual([
        'new',
        'qualification',
        'proposal',
        'negotiation',
      ]);
      expect(knownStages).toEqual([
        'new',
        'qualification',
        'proposal',
        'negotiation',
        'closed_won',
        'closed_lost',
      ]);

      expect(report.snapshot.stages.map((s) => s.stage)).toEqual(openStages);
      expect(report.snapshot.stages).toEqual([
        {
          stage: 'new',
          dealCount: 1,
          totalValue: '1000.00',
          valueSharePercent: '40.00',
        },
        {
          stage: 'qualification',
          dealCount: 0,
          totalValue: '0.00',
          valueSharePercent: '0.00',
        },
        {
          stage: 'proposal',
          dealCount: 2,
          totalValue: '1500.50',
          valueSharePercent: '60.00',
        },
        {
          stage: 'negotiation',
          dealCount: 0,
          totalValue: '0.00',
          valueSharePercent: '0.00',
        },
      ]);
      expect(report.snapshot.openDealCount).toBe(3);
      expect(report.snapshot.openDealValue).toBe('2500.50');
      expect(report.snapshot.unrecognizedStageDealCount).toBe(1);
    });

    it('keeps money as exact decimal strings (no float round trip)', async () => {
      mocks.getPipelineSnapshot.mockResolvedValue({
        asOf: 'x',
        openStages: [],
        openDealCount: 0,
        openDealValue: '0.00',
        unrecognizedStageDealCount: 0,
        createdInRange: { dealCount: 1, totalValue: '9999999999.99' },
      });

      const report = await service.getPipelineSnapshot('c1', query);

      expect(report.createdInRange.totalValue).toBe('9999999999.99');
      expect(typeof report.snapshot.openDealValue).toBe('string');
    });

    it('reports null shares (not 0% or NaN) when the open value is 0', async () => {
      mocks.getPipelineSnapshot.mockResolvedValue({
        asOf: 'x',
        openStages: [],
        openDealCount: 0,
        openDealValue: '0.00',
        unrecognizedStageDealCount: 0,
        createdInRange: { dealCount: 0, totalValue: '0.00' },
      });

      const report = await service.getPipelineSnapshot('c1', query);

      expect(
        report.snapshot.stages.every((s) => s.valueSharePercent === null),
      ).toBe(true);
      expect(report.snapshot.openDealCount).toBe(0);
    });

    it('keeps the snapshot and the created-in-range block as separate fields', async () => {
      mocks.getPipelineSnapshot.mockResolvedValue({
        asOf: 'x',
        openStages: [],
        openDealCount: 7,
        openDealValue: '70.00',
        unrecognizedStageDealCount: 0,
        createdInRange: { dealCount: 2, totalValue: '20.00' },
      });

      const report = await service.getPipelineSnapshot('c1', query);

      expect(report.snapshot.openDealCount).toBe(7);
      expect(report.createdInRange.dealCount).toBe(2);
    });
  });

  describe('R3 leads overview', () => {
    it('zero-fills the known statuses, separates unknown ones and never calls linked-deal a conversion', async () => {
      mocks.getLeadsAggregate.mockResolvedValue({
        totalLeads: 10,
        leadsWithLinkedDeal: 3,
        statusCounts: [
          { status: 'new', count: 6 },
          { status: 'lost', count: 3 },
          { status: 'legacy_status', count: 1 },
        ],
        sourceCounts: [],
      });

      const report = await service.getLeadsOverview('c1', query);

      expect(report.statusDistribution).toEqual([
        { status: 'new', count: 6 },
        { status: 'contacted', count: 0 },
        { status: 'qualified', count: 0 },
        { status: 'unqualified', count: 0 },
        { status: 'lost', count: 3 },
      ]);
      expect(report.unrecognizedStatusCount).toBe(1);
      expect(report.leadsWithLinkedDeal).toEqual({
        count: 3,
        percentOfLeads: '30.00',
      });
      expect(report).not.toHaveProperty('conversionRate');
    });

    it('returns a null percentage when there are no leads', async () => {
      mocks.getLeadsAggregate.mockResolvedValue({
        totalLeads: 0,
        leadsWithLinkedDeal: 0,
        statusCounts: [],
        sourceCounts: [],
      });

      const report = await service.getLeadsOverview('c1', query);

      expect(report.leadsWithLinkedDeal.percentOfLeads).toBeNull();
      expect(report.sources).toEqual([]);
    });

    it('keeps null/blank, a literal "other"/"unknown" source and the synthetic long-tail bucket distinct', async () => {
      const named = Array.from({ length: 12 }, (_, i) => ({
        source: `src-${String(i).padStart(2, '0')}`,
        count: 20 - i,
      }));
      mocks.getLeadsAggregate.mockResolvedValue({
        totalLeads: 0,
        leadsWithLinkedDeal: 0,
        statusCounts: [],
        sourceCounts: [
          { source: null, count: 4 },
          { source: 'other', count: 100 },
          { source: 'unknown', count: 50 },
          ...named,
        ],
      });

      const { sources } = await service.getLeadsOverview('c1', query);

      // Top 10 listed (other=100, unknown=50, src-00..src-07), then the
      // rolled-up tail, then unspecified.
      expect(sources).toHaveLength(12);
      expect(sources[0]).toEqual({
        kind: 'source',
        value: 'other',
        count: 100,
      });
      expect(sources[1]).toEqual({
        kind: 'source',
        value: 'unknown',
        count: 50,
      });
      expect(sources[10]).toEqual({
        kind: 'other',
        sourceCount: 4,
        count: 20 - 8 + (20 - 9) + (20 - 10) + (20 - 11),
      });
      expect(sources[11]).toEqual({ kind: 'unspecified', count: 4 });
      expect(sources.filter((s) => s.kind === 'other')).toHaveLength(1);
    });

    it('omits the other and unspecified buckets when they are empty', async () => {
      mocks.getLeadsAggregate.mockResolvedValue({
        totalLeads: 2,
        leadsWithLinkedDeal: 0,
        statusCounts: [],
        sourceCounts: [{ source: 'web', count: 2 }],
      });

      const { sources } = await service.getLeadsOverview('c1', query);

      expect(sources).toEqual([{ kind: 'source', value: 'web', count: 2 }]);
    });
  });

  describe('R4 tasks overview', () => {
    const aggregate = (
      counts: Record<string, number>,
      noDue = { total: 0, open: 0 },
    ) => ({
      totalDueInRange: Object.values(counts).reduce((a, b) => a + b, 0),
      statusCounts: Object.entries(counts).map(([status, count]) => ({
        status,
        count,
      })),
      withoutDueDateTotal: noDue.total,
      withoutDueDateOpen: noDue.open,
    });

    it('removes cancelled tasks from the denominator exactly once', async () => {
      // eligible = 10, cancelled = 2, completed = 4  ->  4 / (10 - 2) = 50.00
      mocks.getTasksAggregate.mockResolvedValue(
        aggregate({ todo: 2, in_progress: 2, completed: 4, cancelled: 2 }),
      );

      const report = await service.getTasksOverview('c1', query);

      expect(report.totalDueInRange).toBe(10);
      expect(report.completionRatePercent).toBe('50.00');
      expect(report.byStatus).toEqual({
        todo: 2,
        in_progress: 2,
        completed: 4,
        cancelled: 2,
        other: 0,
      });
    });

    it('returns null when every eligible task is cancelled (denominator 0)', async () => {
      mocks.getTasksAggregate.mockResolvedValue(aggregate({ cancelled: 3 }));

      const report = await service.getTasksOverview('c1', query);

      expect(report.completionRatePercent).toBeNull();
    });

    it('returns null for an empty cohort and keeps tasks without a due date out of it', async () => {
      mocks.getTasksAggregate.mockResolvedValue(
        aggregate({}, { total: 9, open: 6 }),
      );

      const report = await service.getTasksOverview('c1', query);

      expect(report.totalDueInRange).toBe(0);
      expect(report.completionRatePercent).toBeNull();
      expect(report.withoutDueDate).toEqual({ total: 9, open: 6 });
    });

    it('treats an unknown status as eligible (stays in the denominator) and reports it as other', async () => {
      mocks.getTasksAggregate.mockResolvedValue(
        aggregate({ completed: 1, mystery: 1 }),
      );

      const report = await service.getTasksOverview('c1', query);

      expect(report.byStatus.other).toBe(1);
      expect(report.completionRatePercent).toBe('50.00');
    });

    it('passes only the open statuses (todo, in_progress) for the no-due-date breakdown', async () => {
      mocks.getTasksAggregate.mockResolvedValue(aggregate({}));

      await service.getTasksOverview('c1', query);

      expect(mocks.getTasksAggregate.mock.calls[0][1]).toEqual([
        'todo',
        'in_progress',
      ]);
    });
  });

  it('forwards only the companyId it was given (tenant comes from the caller, never the query)', async () => {
    mocks.getTasksAggregate.mockResolvedValue({
      totalDueInRange: 0,
      statusCounts: [],
      withoutDueDateTotal: 0,
      withoutDueDateOpen: 0,
    });

    await service.getTasksOverview('company-from-token', query);

    expect(mocks.getTasksAggregate.mock.calls[0][0]).toBe('company-from-token');
  });
});
