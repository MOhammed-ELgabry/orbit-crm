import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PaginationUtil } from '../../../common/utils/pagination.util';
import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaQueryBuilder } from '../../../common/utils/prisma-query-builder.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { CreateTaskDto } from '../dto/create-task.dto';
import { TaskQueryDto } from '../dto/task-query.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { TaskEntity } from '../entities/task.entity';

import {
  ITaskRepository,
  TaskRepositoryResult,
} from './task.repository.interface';

@Injectable()
export class TaskRepository implements ITaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    createdById: string,
    dto: CreateTaskDto,
    completedAt: Date | null,
  ): Promise<TaskEntity> {
    try {
      const task = await this.prisma.task.create({
        data: {
          companyId,
          createdById,

          title: dto.title,

          description: dto.description ?? null,

          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.priority !== undefined && { priority: dto.priority }),

          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          completedAt,

          contactId: dto.contactId ?? null,
          leadId: dto.leadId ?? null,
          dealId: dto.dealId ?? null,
          assignedToId: dto.assignedToId ?? null,
        },
      });

      return new TaskEntity(task);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async findAll(
    companyId: string,
    query: TaskQueryDto,
  ): Promise<TaskRepositoryResult> {
    const { page, limit } = PaginationUtil.getPagination(query);

    const prismaQuery = PrismaQueryBuilder.build(
      query,
      {
        searchableFields: ['title', 'description'],

        sortableFields: [
          'title',
          'status',
          'priority',
          'dueDate',
          'createdAt',
          'updatedAt',
        ],

        selectableFields: [
          'id',
          'companyId',
          'title',
          'description',
          'status',
          'priority',
          'dueDate',
          'completedAt',
          'contactId',
          'leadId',
          'dealId',
          'createdById',
          'assignedToId',
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

    const where: Prisma.TaskWhereInput = {
      ...(prismaQuery.where as Prisma.TaskWhereInput),

      ...(query.status !== undefined && {
        status: query.status,
      }),

      ...(query.priority !== undefined && {
        priority: query.priority,
      }),

      ...(query.assignedToId !== undefined && {
        assignedToId: query.assignedToId,
      }),

      ...(query.contactId !== undefined && {
        contactId: query.contactId,
      }),

      ...(query.leadId !== undefined && {
        leadId: query.leadId,
      }),

      ...(query.dealId !== undefined && {
        dealId: query.dealId,
      }),
    };

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,

        orderBy: prismaQuery.orderBy,

        select: prismaQuery.select,

        skip: prismaQuery.skip,

        take: prismaQuery.take,
      }),

      this.prisma.task.count({
        where,
      }),
    ]);

    return {
      // A narrowed `select` may omit any field (the `fields` query
      // param) — TaskEntity's own fields all stay optional-safe via
      // Object.assign, exactly like DealEntity/LeadEntity do for the
      // same narrowed-select case.
      data: tasks.map((task) => new TaskEntity(task)),
      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async findById(
    companyId: string,
    taskId: string,
  ): Promise<TaskEntity | null> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        companyId,
        deletedAt: null,
      },
    });

    if (!task) {
      return null;
    }

    return new TaskEntity(task);
  }

  async update(
    companyId: string,
    taskId: string,
    dto: UpdateTaskDto,
    completedAt: Date | null | undefined,
  ): Promise<TaskEntity | null> {
    try {
      const existingTask = await this.prisma.task.findFirst({
        where: {
          id: taskId,
          companyId,
          deletedAt: null,
        },
      });

      if (!existingTask) {
        return null;
      }

      const task = await this.prisma.task.update({
        where: {
          id: taskId,
          companyId,
          deletedAt: null,
        },

        data: {
          ...(dto.title !== undefined && {
            title: dto.title,
          }),

          ...(dto.description !== undefined && {
            description: dto.description,
          }),

          ...(dto.status !== undefined && {
            status: dto.status,
          }),

          ...(dto.priority !== undefined && {
            priority: dto.priority,
          }),

          ...(dto.dueDate !== undefined && {
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          }),

          ...(completedAt !== undefined && {
            completedAt,
          }),

          ...(dto.contactId !== undefined && {
            contactId: dto.contactId,
          }),

          ...(dto.leadId !== undefined && {
            leadId: dto.leadId,
          }),

          ...(dto.dealId !== undefined && {
            dealId: dto.dealId,
          }),

          ...(dto.assignedToId !== undefined && {
            assignedToId: dto.assignedToId,
          }),
        },
      });

      return new TaskEntity(task);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async softDelete(companyId: string, taskId: string): Promise<boolean> {
    try {
      const result = await this.prisma.task.updateMany({
        where: {
          id: taskId,
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
