import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PaginationUtil } from '../../../common/utils/pagination.util';
import { PrismaQueryBuilder } from '../../../common/utils/prisma-query-builder.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { ACTIVITY_SORTABLE_FIELDS } from '../constants/activity.constants';
import { CreateActivityDto } from '../dto/create-activity.dto';
import { ActivityQueryDto } from '../dto/activity-query.dto';
import { UpdateActivityDto } from '../dto/update-activity.dto';
import { ActivityEntity } from '../entities/activity.entity';

import {
  ActivityRepositoryResult,
  IActivityRepository,
} from './activity.repository.interface';

type ActivitySortableField = (typeof ACTIVITY_SORTABLE_FIELDS)[number];

@Injectable()
export class ActivityRepository implements IActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    createdById: string,
    dto: CreateActivityDto,
  ): Promise<ActivityEntity> {
    try {
      const activity = await this.prisma.activity.create({
        data: {
          companyId,
          createdById,

          type: dto.type,
          title: dto.title,
          description: dto.description ?? null,

          ...(dto.occurredAt !== undefined && {
            occurredAt: new Date(dto.occurredAt),
          }),

          contactId: dto.contactId ?? null,
        },
      });

      return new ActivityEntity(activity);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async findAll(
    companyId: string,
    query: ActivityQueryDto,
  ): Promise<ActivityRepositoryResult> {
    const { page, limit } = PaginationUtil.getPagination(query);

    // Only where/select/skip/take come from the shared builder — see the
    // orderBy note below for why sorting is computed separately.
    const prismaQuery = PrismaQueryBuilder.build(
      query,
      {
        searchableFields: ['title', 'description'],

        sortableFields: [...ACTIVITY_SORTABLE_FIELDS],

        selectableFields: [
          'id',
          'companyId',
          'type',
          'title',
          'description',
          'occurredAt',
          'createdById',
          'contactId',
          'createdAt',
          'updatedAt',
          'deletedAt',
        ] as const,
      },
      {
        companyId,
        deletedAt: null,
      },
    );

    const where: Prisma.ActivityWhereInput = {
      ...(prismaQuery.where as Prisma.ActivityWhereInput),

      ...(query.type !== undefined && {
        type: query.type,
      }),

      ...(query.contactId !== undefined && {
        contactId: query.contactId,
      }),

      ...((query.dateFrom !== undefined || query.dateTo !== undefined) && {
        occurredAt: {
          ...(query.dateFrom !== undefined && {
            gte: new Date(query.dateFrom),
          }),
          ...(query.dateTo !== undefined && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    // PrismaQueryBuilder falls back to `createdAt` when no sortBy is
    // given, which is the right generic default for Contact/Company but
    // not for a timeline — this is explicitly meant to order by when an
    // activity *occurred*. It also only ever returns a single-field
    // orderBy, which can't guarantee a deterministic order when two
    // activities share the same occurredAt/createdAt. So sorting for
    // Activities is computed here instead of taken from the builder:
    // default to `occurredAt`, and always append `id` as a tie-breaker.
    const sortBy: ActivitySortableField =
      query.sortBy &&
      (ACTIVITY_SORTABLE_FIELDS as readonly string[]).includes(query.sortBy)
        ? (query.sortBy as ActivitySortableField)
        : 'occurredAt';

    const orderBy: Prisma.ActivityOrderByWithRelationInput[] = [
      { [sortBy]: query.sortOrder },
      { id: query.sortOrder },
    ];

    const [activities, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        orderBy,
        select: prismaQuery.select,
        skip: prismaQuery.skip,
        take: prismaQuery.take,
      }),

      this.prisma.activity.count({
        where,
      }),
    ]);

    return {
      data: activities.map((activity) => new ActivityEntity(activity)),
      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async findById(
    companyId: string,
    activityId: string,
  ): Promise<ActivityEntity | null> {
    const activity = await this.prisma.activity.findFirst({
      where: {
        id: activityId,
        companyId,
        deletedAt: null,
      },
    });

    if (!activity) {
      return null;
    }

    return new ActivityEntity(activity);
  }

  async update(
    companyId: string,
    activityId: string,
    dto: UpdateActivityDto,
  ): Promise<ActivityEntity | null> {
    try {
      const existingActivity = await this.prisma.activity.findFirst({
        where: {
          id: activityId,
          companyId,
          deletedAt: null,
        },
      });

      if (!existingActivity) {
        return null;
      }

      const activity = await this.prisma.activity.update({
        where: {
          id: activityId,
          companyId,
          deletedAt: null,
        },

        data: {
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.occurredAt !== undefined && {
            occurredAt: new Date(dto.occurredAt),
          }),
          ...(dto.contactId !== undefined && { contactId: dto.contactId }),
        },
      });

      return new ActivityEntity(activity);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async softDelete(companyId: string, activityId: string): Promise<boolean> {
    try {
      const result = await this.prisma.activity.updateMany({
        where: {
          id: activityId,
          companyId,
          deletedAt: null,
        },

        data: {
          deletedAt: new Date(),
        },
      });

      return result.count > 0;
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}
