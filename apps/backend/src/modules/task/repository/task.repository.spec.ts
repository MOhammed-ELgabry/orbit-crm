/**
 * Narrow, direct repository test (same deliberate exception as
 * calendar-event.repository.spec.ts): how TaskRepository.findAll composes its
 * Prisma `where` for the Customer 360 "tasks of this contact" list is not
 * observable through a mocked ITaskRepository.
 *
 * This file proves the SHAPE of the query. That PostgreSQL really returns an
 * empty page for a foreign contact - even when this company has tasks that
 * (inconsistently) point at it - is proven by
 * test/integration/activities/customer360-tenant-isolation.int-spec.ts.
 */
import { TaskQueryDto } from '../dto/task-query.dto';

import { TaskRepository } from './task.repository';

describe('TaskRepository.findAll (contact filter)', () => {
  function makeQuery(overrides: Partial<TaskQueryDto> = {}) {
    return Object.assign(new TaskQueryDto(), overrides);
  }

  function makeRepository() {
    const prisma = {
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    return { repository: new TaskRepository(prisma as never), prisma };
  }

  type FindManyArgs = { where: Record<string, unknown> };
  const whereOf = (prisma: ReturnType<typeof makeRepository>['prisma']) => {
    const [[args]] = prisma.task.findMany.mock.calls as [[FindManyArgs]];
    return args.where;
  };

  it('a contactId filter only matches a contact of the caller company, in addition to the task tenant scope', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll(
      'company-b',
      makeQuery({ contactId: 'contact-of-company-a' }),
    );

    const where = whereOf(prisma);
    expect(where.companyId).toBe('company-b');
    expect(where.deletedAt).toBeNull();
    expect(where.contactId).toBe('contact-of-company-a');
    expect(where.contact).toEqual({ is: { companyId: 'company-b' } });
  });

  it('uses the same where for the rows and for the total', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll('company-b', makeQuery({ contactId: 'c1' }));

    expect(prisma.task.count).toHaveBeenCalledWith({
      where: whereOf(prisma),
    });
  });

  it('adds no contact condition when no contactId is requested', async () => {
    const { repository, prisma } = makeRepository();

    await repository.findAll('company-b', makeQuery());

    const where = whereOf(prisma);
    expect('contactId' in where).toBe(false);
    expect('contact' in where).toBe(false);
    expect(where.companyId).toBe('company-b');
  });
});
