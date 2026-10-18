/**
 * Direct repository-level test, in the same deliberate, narrowly-scoped
 * style as calendar-event.repository.spec.ts: how ActivityRepository.findAll
 * composes the Prisma `where` for a contact timeline cannot be observed
 * through a mocked IActivityRepository — it only exists in the Prisma call
 * arguments asserted here.
 *
 * What this file proves: the shape of the query (tenant scope, soft delete,
 * the contact-timeline filter, and that `search` / date / type filters,
 * pagination and ordering all survive it). What it cannot prove — that
 * PostgreSQL really returns the right rows — is covered by
 * test/integration/activities/activities-contact-timeline.int-spec.ts.
 */
import { ActivityQueryDto } from '../dto/activity-query.dto';

import { ActivityRepository } from './activity.repository';
import { buildContactTimelineFilter } from './contact-timeline.filter';

describe('ActivityRepository.findAll (contact timeline)', () => {
  const companyId = 'company-a';
  const contactId = 'contact-1';

  function makeQuery(overrides: Partial<ActivityQueryDto> = {}) {
    return Object.assign(new ActivityQueryDto(), overrides);
  }

  function makeRepository() {
    const prisma = {
      activity: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const repository = new ActivityRepository(prisma as never);

    return { repository, prisma };
  }

  type FindManyArgs = {
    where: Record<string, unknown>;
    orderBy: Array<Record<string, string>>;
    skip: number;
    take: number;
  };

  function findManyArgs(prisma: ReturnType<typeof makeRepository>['prisma']) {
    const [[args]] = prisma.activity.findMany.mock.calls as [[FindManyArgs]];
    return args;
  }

  it('always scopes to the caller company and excludes soft-deleted activities', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll(companyId, makeQuery({ contactId }));

    const { where } = findManyArgs(prisma);
    expect(where.companyId).toBe(companyId);
    expect(where.deletedAt).toBeNull();
  });

  it('applies the contact-timeline filter through AND, and no longer filters on Activity.contactId alone', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll(companyId, makeQuery({ contactId }));

    const { where } = findManyArgs(prisma);
    expect(where.AND).toEqual([
      buildContactTimelineFilter(companyId, contactId),
    ]);
    expect('contactId' in where).toBe(false);
  });

  it('uses the same where for the page query and for the total count (so pagination meta matches the rows)', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll(companyId, makeQuery({ contactId }));

    const { where } = findManyArgs(prisma);
    expect(prisma.activity.count).toHaveBeenCalledWith({ where });
  });

  it('keeps `search` working: the top-level OR from the shared query builder is not overwritten by the timeline filter', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll(
      companyId,
      makeQuery({ contactId, search: 'renewal' }),
    );

    const { where } = findManyArgs(prisma);
    expect(where.OR).toEqual([
      { title: { contains: 'renewal', mode: 'insensitive' } },
      { description: { contains: 'renewal', mode: 'insensitive' } },
    ]);
    expect(where.AND).toEqual([
      buildContactTimelineFilter(companyId, contactId),
    ]);
  });

  it('keeps the type and date-range filters alongside the timeline filter', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll(
      companyId,
      makeQuery({
        contactId,
        type: 'STATUS_CHANGE',
        dateFrom: '2026-10-01T00:00:00.000Z',
        dateTo: '2026-10-31T23:59:59.000Z',
      }),
    );

    const { where } = findManyArgs(prisma);
    expect(where.type).toBe('STATUS_CHANGE');
    expect(where.occurredAt).toEqual({
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lte: new Date('2026-10-31T23:59:59.000Z'),
    });
    expect(where.AND).toBeDefined();
  });

  it('keeps pagination and the deterministic order (occurredAt, then id as tie-breaker)', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll(
      companyId,
      makeQuery({ contactId, page: 3, limit: 10, sortOrder: 'desc' }),
    );

    const args = findManyArgs(prisma);
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual([{ occurredAt: 'desc' }, { id: 'desc' }]);
  });

  it('does not add any contact filter when no contactId is requested (the global feed is unchanged)', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll(companyId, makeQuery());

    const { where } = findManyArgs(prisma);
    expect('AND' in where).toBe(false);
    expect('contactId' in where).toBe(false);
    expect(where.companyId).toBe(companyId);
    expect(where.deletedAt).toBeNull();
  });

  it('takes the tenant only from its companyId argument, never from the contact id it is asked to match', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll(
      'company-b',
      makeQuery({ contactId: 'contact-of-another-tenant' }),
    );

    const { where } = findManyArgs(prisma);
    const companyIds = JSON.stringify(where).match(/"companyId":"[^"]*"/g);

    expect(where.companyId).toBe('company-b');
    // Top level (1) + the contact's ownership in every branch (4: direct,
    // deal, task, calendarEvent) + the company of each related source row
    // (3: deal, task, calendarEvent): all company-b, never the contact's.
    expect(companyIds).toHaveLength(8);
    expect(new Set(companyIds)).toEqual(new Set(['"companyId":"company-b"']));
  });

  it('returns the pagination meta computed from the count', async () => {
    const { repository, prisma } = makeRepository();
    prisma.activity.count.mockResolvedValue(25);

    const result = await repository.findAll(
      companyId,
      makeQuery({ contactId, page: 2, limit: 10 }),
    );

    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });
});
