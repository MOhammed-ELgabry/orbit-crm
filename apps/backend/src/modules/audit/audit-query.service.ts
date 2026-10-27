import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PaginationUtil } from '../../common/utils/pagination.util';
import type { PaginationMeta } from '../../common/interfaces/pagination-result.interface';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

import type { AuditScope } from './audit-scope';
import { AUDIT_QUERY_LIMITS } from './audit.constants';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

export type AuditActorStatus = 'active' | 'inactive' | 'deleted' | 'unknown';

export interface AuditActorView {
  id: string;
  name: string | null;
  status: AuditActorStatus;
}

export interface AuditLogListItem {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  actor: AuditActorView | null;
  changedFields: string[];
  metadata: unknown;
  correlationId: string | null;
}

export interface AuditLogDetail extends AuditLogListItem {
  changes: unknown;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditLogListResult {
  data: AuditLogListItem[];
  meta: PaginationMeta;
}

type AuditRow = Prisma.AuditLogGetPayload<object>;

/**
 * Read side of the audit log. EVERY query is built from the AuditScope that
 * AuditOwnerGuard derived from the database — the first and mandatory
 * condition is `companyId = scope.companyId`. Nothing here accepts a company
 * id from the request.
 */
@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    scope: AuditScope,
    query: AuditLogQueryDto,
    now: Date = new Date(),
  ): Promise<AuditLogListResult> {
    const { from, to } = this.resolveRange(query, now);
    const page = query.page ?? 1;
    const limit = query.limit ?? AUDIT_QUERY_LIMITS.defaultLimit;

    const where: Prisma.AuditLogWhereInput = {
      companyId: scope.companyId,
      occurredAt: { gte: from, lte: to },
      ...(query.actorUserId && { actorUserId: query.actorUserId }),
      ...(query.action && { action: query.action }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.correlationId && { correlationId: query.correlationId }),
    };

    const search = query.q?.trim();

    if (search) {
      const actorIds = await this.findActorIdsByName(scope, search);

      where.OR = [
        { entityLabel: { contains: search, mode: 'insensitive' } },
        ...(actorIds.length > 0 ? [{ actorUserId: { in: actorIds } }] : []),
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const actors = await this.resolveActors(scope, rows);

    return {
      data: rows.map((row) => this.toListItem(row, actors)),
      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async getById(scope: AuditScope, id: string): Promise<AuditLogDetail> {
    const row = await this.prisma.auditLog.findFirst({
      where: { id, companyId: scope.companyId },
    });

    // A row of another company is indistinguishable from a missing one.
    if (!row) {
      throw new NotFoundException('Audit log entry not found.');
    }

    const actors = await this.resolveActors(scope, [row]);

    return {
      ...this.toListItem(row, actors),
      changes: row.changes,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    };
  }

  /** Distinct actors that appear in this company's log (for the filter). */
  async listActors(scope: AuditScope): Promise<AuditActorView[]> {
    const groups = await this.prisma.auditLog.groupBy({
      by: ['actorUserId'],
      where: { companyId: scope.companyId, actorUserId: { not: null } },
      _max: { occurredAt: true },
      orderBy: { _max: { occurredAt: 'desc' } },
      take: AUDIT_QUERY_LIMITS.maxActors,
    });

    const ids = groups
      .map((group) => group.actorUserId)
      .filter((id): id is string => id !== null);

    const users = await this.loadUsers(scope, ids);

    return ids.map((id) => this.actorView(id, users));
  }

  private resolveRange(
    query: AuditLogQueryDto,
    now: Date,
  ): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - AUDIT_QUERY_LIMITS.defaultRangeDays * DAY_MS);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid period.');
    }

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('"from" must not be after "to".');
    }

    if (
      to.getTime() - from.getTime() >
      AUDIT_QUERY_LIMITS.maxRangeDays * DAY_MS
    ) {
      throw new BadRequestException(
        `The requested period cannot exceed ${AUDIT_QUERY_LIMITS.maxRangeDays} days.`,
      );
    }

    return { from, to };
  }

  private async findActorIdsByName(
    scope: AuditScope,
    search: string,
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        companyId: scope.companyId,
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: AUDIT_QUERY_LIMITS.maxActorSearchMatches,
    });

    return users.map((user) => user.id);
  }

  private async loadUsers(scope: AuditScope, ids: string[]) {
    if (ids.length === 0) {
      return new Map<
        string,
        {
          id: string;
          firstName: string;
          lastName: string;
          isActive: boolean;
          deletedAt: Date | null;
        }
      >();
    }

    // Soft-deleted users are included on purpose: their id stays in history.
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, companyId: scope.companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        isActive: true,
        deletedAt: true,
      },
    });

    return new Map(users.map((user) => [user.id, user]));
  }

  private async resolveActors(scope: AuditScope, rows: AuditRow[]) {
    const ids = Array.from(
      new Set(
        rows
          .map((row) => row.actorUserId)
          .filter((id): id is string => id !== null),
      ),
    );

    return this.loadUsers(scope, ids);
  }

  private actorView(
    id: string,
    users: Awaited<ReturnType<AuditQueryService['loadUsers']>>,
  ): AuditActorView {
    const user = users.get(id);

    if (!user) {
      return { id, name: null, status: 'unknown' };
    }

    return {
      id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      status: user.deletedAt
        ? 'deleted'
        : user.isActive
          ? 'active'
          : 'inactive',
    };
  }

  private toListItem(
    row: AuditRow,
    users: Awaited<ReturnType<AuditQueryService['loadUsers']>>,
  ): AuditLogListItem {
    const changes = row.changes;

    return {
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      actor: row.actorUserId ? this.actorView(row.actorUserId, users) : null,
      changedFields:
        changes && typeof changes === 'object' && !Array.isArray(changes)
          ? Object.keys(changes)
          : [],
      metadata: row.metadata,
      correlationId: row.correlationId,
    };
  }
}
