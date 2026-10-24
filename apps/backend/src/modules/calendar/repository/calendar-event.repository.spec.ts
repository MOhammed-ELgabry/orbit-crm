/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- jest mock call records are untyped (`any`) by design */
/**
 * This codebase's repositories are normally exercised indirectly
 * through service-level tests against a mocked I*Repository (see
 * calendar.service.spec.ts) — see the comment at the top of
 * user.repository.spec.ts, the one existing precedent for a direct
 * repository-level test. This file is the same kind of deliberate,
 * narrowly-scoped exception: the exact shape of the bounded
 * date-range/overlap query in findAll, and that every method's Prisma
 * `where` includes both companyId and deletedAt: null, are not
 * observable at all through a mocked repository — they only exist in
 * this file's actual Prisma call arguments.
 */
import { NotFoundException } from '@nestjs/common';

import { CalendarEventRepository } from './calendar-event.repository';
import { AuditWriteFailedException } from '../../audit/audit.writer';
import type { AuditActor } from '../../audit/audit.types';

const audit: AuditActor = { actorUserId: 'actor-1' };

describe('CalendarEventRepository', () => {
  const companyId = 'company-1';
  const eventId = 'event-1';

  function makeMocks() {
    const prisma = {
      $transaction: jest.fn(),
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      calendarEvent: {
        create: jest.fn().mockResolvedValue({ id: eventId }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: eventId }),
        update: jest.fn().mockResolvedValue({ id: eventId }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    // Interactive-transaction stand-in: the callback runs against the same
    // mock, exactly like Prisma passes its `tx` client.
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(prisma),
    );

    const repository = new CalendarEventRepository(prisma as never);

    return { repository, prisma };
  }

  describe('findAll', () => {
    it('scopes to companyId and deletedAt: null, and expresses the overlap test as a bounded startAt range plus an endAt filter', async () => {
      const { repository, prisma } = makeMocks();

      const from = new Date('2026-10-01T00:00:00.000Z');
      const to = new Date('2026-11-01T00:00:00.000Z');
      const queryLowerBound = new Date('2026-08-31T00:00:00.000Z');

      await repository.findAll(companyId, from, to, queryLowerBound, {});

      expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId,
            deletedAt: null,
            startAt: { gte: queryLowerBound, lt: to },
            endAt: { gt: from },
          }),
        }),
      );
    });

    it('applies optional filters only when actually supplied', async () => {
      const { repository, prisma } = makeMocks();
      const from = new Date();
      const to = new Date(from.getTime() + 1000);

      await repository.findAll(companyId, from, to, from, {
        status: 'completed',
      });

      const [[callArgs]] = prisma.calendarEvent.findMany.mock.calls;
      expect(callArgs.where.status).toBe('completed');
      expect('assignedToId' in callArgs.where).toBe(false);
      expect('contactId' in callArgs.where).toBe(false);
    });

    it('a contactId filter only matches a contact of the caller company (Customer 360 calendar tab)', async () => {
      const { repository, prisma } = makeMocks();
      const from = new Date();
      const to = new Date(from.getTime() + 1000);

      await repository.findAll('company-b', from, to, from, {
        contactId: 'contact-of-company-a',
      });

      const [[callArgs]] = prisma.calendarEvent.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
      ];
      expect(callArgs.where.companyId).toBe('company-b');
      expect(callArgs.where.deletedAt).toBeNull();
      expect(callArgs.where.contactId).toBe('contact-of-company-a');
      // The behaviour (an empty page for a foreign contact, even when this
      // company has rows pointing at it) is proven against PostgreSQL in
      // test/integration/activities/customer360-tenant-isolation.int-spec.ts.
      expect(callArgs.where.contact).toEqual({
        is: { companyId: 'company-b' },
      });
      // And with no contactId requested, no contact condition is added.
      await repository.findAll('company-b', from, to, from, {});
      const [, [secondCall]] = prisma.calendarEvent.findMany.mock.calls as [
        unknown,
        [{ where: Record<string, unknown> }],
      ];
      expect('contact' in secondCall.where).toBe(false);
    });

    it('fetches one row more than the display limit and reports hasMore without a separate count query', async () => {
      const { repository, prisma } = makeMocks();
      const rows = Array.from({ length: 501 }, (_, i) => ({ id: `e${i}` }));
      prisma.calendarEvent.findMany.mockResolvedValue(rows);

      const result = await repository.findAll(
        companyId,
        new Date(),
        new Date(),
        new Date(),
        {},
      );

      expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 501 }),
      );
      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(500);
    });

    it('reports hasMore: false and returns every row when the limit is not exceeded', async () => {
      const { repository, prisma } = makeMocks();
      prisma.calendarEvent.findMany.mockResolvedValue([
        { id: 'e1' },
        { id: 'e2' },
      ]);

      const result = await repository.findAll(
        companyId,
        new Date(),
        new Date(),
        new Date(),
        {},
      );

      expect(result.hasMore).toBe(false);
      expect(result.data).toHaveLength(2);
    });

    it('orders by startAt then id, matching the fixed, non-configurable sort the API contract promises', async () => {
      const { repository, prisma } = makeMocks();

      await repository.findAll(
        companyId,
        new Date(),
        new Date(),
        new Date(),
        {},
      );

      expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });
  });

  describe('findById', () => {
    it('scopes to id, companyId, and deletedAt: null together', async () => {
      const { repository, prisma } = makeMocks();

      await repository.findById(companyId, eventId);

      expect(prisma.calendarEvent.findFirst).toHaveBeenCalledWith({
        where: { id: eventId, companyId, deletedAt: null },
      });
    });

    it('returns null (not an empty entity) when Prisma finds no row', async () => {
      const { repository, prisma } = makeMocks();
      prisma.calendarEvent.findFirst.mockResolvedValue(null);

      const result = await repository.findById(companyId, eventId);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('scopes the update where-clause to id, companyId, and deletedAt: null — a cross-company id cannot match', async () => {
      const { repository, prisma } = makeMocks();

      await repository.update(companyId, eventId, { title: 'Renamed' }, audit);

      expect(prisma.calendarEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: eventId, companyId, deletedAt: null },
        }),
      );
    });

    it('omits a field entirely from the Prisma data payload when the input leaves it undefined', async () => {
      const { repository, prisma } = makeMocks();

      await repository.update(
        companyId,
        eventId,
        { title: 'Renamed only' },
        audit,
      );

      const [[callArgs]] = prisma.calendarEvent.update.mock.calls;
      expect('contactId' in callArgs.data).toBe(false);
      expect('startAt' in callArgs.data).toBe(false);
    });

    it('writes an explicit null through unchanged when the input clears a relation', async () => {
      const { repository, prisma } = makeMocks();

      await repository.update(companyId, eventId, { contactId: null }, audit);

      const [[callArgs]] = prisma.calendarEvent.update.mock.calls;
      expect(callArgs.data.contactId).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('uses updateMany scoped to id/companyId/deletedAt: null and sets deletedAt, never a hard delete', async () => {
      const { repository, prisma } = makeMocks();

      await repository.softDelete(companyId, eventId, audit);

      expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith({
        where: { id: eventId, companyId, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('returns false when no row matched (cross-company id, or already deleted)', async () => {
      const { repository, prisma } = makeMocks();
      prisma.calendarEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await repository.softDelete(companyId, eventId, audit);

      expect(result).toBe(false);
    });
  });

  describe('audit (same transaction as the write)', () => {
    it('create() writes one audit row on the transaction client', async () => {
      const { repository, prisma } = makeMocks();

      await repository.create(
        companyId,
        {
          title: 'T',
          startAt: new Date(),
          endAt: new Date(),
          allDay: false,
          createdById: 'user-1',
        } as never,
        audit,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          companyId,
          actorUserId: 'actor-1',
          action: 'create',
          entityType: 'calendarEvent',
          entityId: eventId,
        }),
      );
    });

    it('update() reads the "before" row inside the transaction, scoped by company', async () => {
      const { repository, prisma } = makeMocks();

      await repository.update(companyId, eventId, { title: 'New' }, audit);

      expect(prisma.calendarEvent.findFirst).toHaveBeenCalledWith({
        where: { id: eventId, companyId, deletedAt: null },
      });
    });

    it('update() of a missing / foreign-company row throws NotFound and writes no audit row', async () => {
      const { repository, prisma } = makeMocks();
      prisma.calendarEvent.findFirst.mockResolvedValue(null);

      await expect(
        repository.update(companyId, eventId, { title: 'X' }, audit),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('update() that changes nothing auditable writes no audit row', async () => {
      const { repository, prisma } = makeMocks();
      prisma.calendarEvent.findFirst.mockResolvedValue({
        id: eventId,
        title: 'Same',
      });
      prisma.calendarEvent.update.mockResolvedValue({
        id: eventId,
        title: 'Same',
      });

      await repository.update(companyId, eventId, { title: 'Same' }, audit);

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('softDelete() writes a delete audit row only when a row was actually deleted', async () => {
      const { repository, prisma } = makeMocks();

      await repository.softDelete(companyId, eventId, audit);

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe(
        'delete',
      );

      prisma.auditLog.create.mockClear();
      prisma.calendarEvent.updateMany.mockResolvedValue({ count: 0 });

      await repository.softDelete(companyId, eventId, audit);

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('propagates AuditWriteFailedException so the surrounding transaction rolls back', async () => {
      const { repository, prisma } = makeMocks();
      prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));

      await expect(
        repository.softDelete(companyId, eventId, audit),
      ).rejects.toBeInstanceOf(AuditWriteFailedException);
    });
  });
});
