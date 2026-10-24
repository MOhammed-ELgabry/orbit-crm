/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- jest mock call records are untyped (`any`) by design */
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AuditQueryService } from './audit-query.service';
import { createVerifiedAuditScope } from './audit-scope';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-22T12:00:00.000Z');
const scope = createVerifiedAuditScope('owner-1', 'company-A');

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'row-1',
  companyId: 'company-A',
  occurredAt: new Date('2026-10-21T10:00:00.000Z'),
  actorUserId: 'user-1',
  action: 'update',
  entityType: 'contact',
  entityId: 'contact-1',
  entityLabel: 'Amina Hassan',
  changes: { status: { old: 'new', new: 'won' }, email: { changed: true } },
  metadata: null,
  correlationId: null,
  ipAddress: '203.0.113.7',
  userAgent: 'jest',
  ...overrides,
});

function setup() {
  const prisma = {
    auditLog: {
      findMany: jest.fn().mockResolvedValue([row()]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(row()),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'user-1',
          firstName: 'Omar',
          lastName: 'Ali',
          isActive: true,
          deletedAt: null,
        },
      ]),
    },
  };

  return { prisma, service: new AuditQueryService(prisma as never) };
}

const q = (overrides: Partial<AuditLogQueryDto> = {}): AuditLogQueryDto => ({
  page: 1,
  limit: 20,
  ...overrides,
});

describe('AuditQueryService', () => {
  describe('list', () => {
    it('ALWAYS filters by the scope company — first condition, for the rows AND the count', async () => {
      const { prisma, service } = setup();

      await service.list(scope, q(), NOW);

      const [[findArgs]] = prisma.auditLog.findMany.mock.calls;
      const [[countArgs]] = prisma.auditLog.count.mock.calls;
      expect(findArgs.where.companyId).toBe('company-A');
      expect(countArgs.where.companyId).toBe('company-A');
    });

    it('ignores any companyId smuggled into the query object (only the scope counts)', async () => {
      const { prisma, service } = setup();

      await service.list(
        scope,
        { ...q(), companyId: 'company-B' } as unknown as AuditLogQueryDto,
        NOW,
      );

      const [[findArgs]] = prisma.auditLog.findMany.mock.calls;
      expect(findArgs.where.companyId).toBe('company-A');
      expect(JSON.stringify(findArgs.where)).not.toContain('company-B');
    });

    it('defaults to the last 30 days, newest first, with a stable tiebreak on id', async () => {
      const { prisma, service } = setup();

      await service.list(scope, q(), NOW);

      const [[args]] = prisma.auditLog.findMany.mock.calls;
      expect(args.where.occurredAt.lte).toEqual(NOW);
      expect(args.where.occurredAt.gte).toEqual(
        new Date(NOW.getTime() - 30 * DAY),
      );
      expect(args.orderBy).toEqual([{ occurredAt: 'desc' }, { id: 'desc' }]);
    });

    it('accepts a period of exactly 90 days and rejects 91 (400)', async () => {
      const { service } = setup();
      const to = NOW.toISOString();

      await expect(
        service.list(
          scope,
          q({ from: new Date(NOW.getTime() - 90 * DAY).toISOString(), to }),
          NOW,
        ),
      ).resolves.toBeDefined();

      await expect(
        service.list(
          scope,
          q({ from: new Date(NOW.getTime() - 91 * DAY).toISOString(), to }),
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects from > to (400)', async () => {
      const { service } = setup();

      await expect(
        service.list(
          scope,
          q({
            from: '2026-10-20T00:00:00.000Z',
            to: '2026-10-10T00:00:00.000Z',
          }),
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('applies pagination (skip/take) and returns correct meta', async () => {
      const { prisma, service } = setup();
      prisma.auditLog.count.mockResolvedValue(95);

      const result = await service.list(scope, q({ page: 3, limit: 20 }), NOW);

      const [[args]] = prisma.auditLog.findMany.mock.calls;
      expect(args.skip).toBe(40);
      expect(args.take).toBe(20);
      expect(result.meta).toEqual(
        expect.objectContaining({ page: 3, limit: 20, total: 95 }),
      );
    });

    it('passes the exact-match filters through', async () => {
      const { prisma, service } = setup();

      await service.list(
        scope,
        q({
          actorUserId: 'user-1',
          action: 'delete',
          entityType: 'deal',
          entityId: 'deal-1',
          correlationId: 'corr-1',
        }),
        NOW,
      );

      const [[args]] = prisma.auditLog.findMany.mock.calls;
      expect(args.where).toEqual(
        expect.objectContaining({
          actorUserId: 'user-1',
          action: 'delete',
          entityType: 'deal',
          entityId: 'deal-1',
          correlationId: 'corr-1',
        }),
      );
    });

    it("q searches the label and the names of THIS company's users only", async () => {
      const { prisma, service } = setup();

      await service.list(scope, q({ q: 'omar' }), NOW);

      const [[userArgs]] = prisma.user.findMany.mock.calls;
      expect(userArgs.where.companyId).toBe('company-A');
      const [[args]] = prisma.auditLog.findMany.mock.calls;
      expect(args.where.OR).toEqual(
        expect.arrayContaining([
          { entityLabel: { contains: 'omar', mode: 'insensitive' } },
        ]),
      );
    });

    it('resolves actors only within the scope company', async () => {
      const { prisma, service } = setup();

      await service.list(scope, q(), NOW);

      const [[userArgs]] = prisma.user.findMany.mock.calls;
      expect(userArgs.where).toEqual({
        id: { in: ['user-1'] },
        companyId: 'company-A',
      });
    });

    it('shows changed field NAMES only in the list (no values), plus actor and status', async () => {
      const { service } = setup();

      const result = await service.list(scope, q(), NOW);
      const item = result.data[0];

      expect(item.changedFields).toEqual(['status', 'email']);
      expect(item.actor).toEqual({
        id: 'user-1',
        name: 'Omar Ali',
        status: 'active',
      });
      expect(JSON.stringify(item)).not.toContain('won');
      expect('ipAddress' in item).toBe(false);
      expect('changes' in item).toBe(false);
    });

    it('marks deleted / inactive / unknown actors honestly', async () => {
      const { prisma, service } = setup();
      prisma.auditLog.findMany.mockResolvedValue([
        row({ id: 'a', actorUserId: 'gone' }),
        row({ id: 'b', actorUserId: 'deleted-1' }),
        row({ id: 'c', actorUserId: 'off-1' }),
        row({ id: 'd', actorUserId: null }),
      ]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'deleted-1',
          firstName: 'D',
          lastName: 'X',
          isActive: true,
          deletedAt: new Date(),
        },
        {
          id: 'off-1',
          firstName: 'O',
          lastName: 'Y',
          isActive: false,
          deletedAt: null,
        },
      ]);

      const result = await service.list(scope, q(), NOW);

      expect(result.data.map((item) => item.actor?.status ?? null)).toEqual([
        'unknown',
        'deleted',
        'inactive',
        null,
      ]);
    });
  });

  describe('getById', () => {
    it('looks the row up by id AND company, and returns the full detail', async () => {
      const { prisma, service } = setup();

      const detail = await service.getById(scope, 'row-1');

      expect(prisma.auditLog.findFirst).toHaveBeenCalledWith({
        where: { id: 'row-1', companyId: 'company-A' },
      });
      expect(detail.changes).toEqual(row().changes);
      expect(detail.ipAddress).toBe('203.0.113.7');
    });

    it('returns 404 for a row of another company (indistinguishable from missing)', async () => {
      const { prisma, service } = setup();
      prisma.auditLog.findFirst.mockResolvedValue(null);

      await expect(
        service.getById(scope, 'row-of-company-B'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listActors', () => {
    it('groups by actor within the scope company and bounds the result', async () => {
      const { prisma, service } = setup();
      prisma.auditLog.groupBy.mockResolvedValue([
        { actorUserId: 'user-1', _max: { occurredAt: NOW } },
      ]);

      const actors = await service.listActors(scope);

      const [[args]] = prisma.auditLog.groupBy.mock.calls;
      expect(args.where.companyId).toBe('company-A');
      expect(args.take).toBe(100);
      expect(actors).toEqual([
        { id: 'user-1', name: 'Omar Ali', status: 'active' },
      ]);
    });
  });
});
