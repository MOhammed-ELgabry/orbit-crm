import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PaginationUtil } from '../../../common/utils/pagination.util';
import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaQueryBuilder } from '../../../common/utils/prisma-query-builder.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { CreateLeadDto } from '../dto/create-lead.dto';
import { LeadQueryDto } from '../dto/lead-query.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';
import { LeadEntity } from '../entities/lead.entity';

import {
  ILeadRepository,
  LeadRepositoryResult,
} from './lead.repository.interface';

import {
  auditCreate,
  auditDelete,
  auditUpdate,
} from '../../audit/audit.writer';
import type { AuditActor } from '../../audit/audit.types';

@Injectable()
export class LeadRepository implements ILeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    createdById: string,
    dto: CreateLeadDto,
    audit: AuditActor,
  ): Promise<LeadEntity> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const lead = await tx.lead.create({
          data: {
            companyId,
            createdById,

            firstName: dto.firstName,
            lastName: dto.lastName,

            email: dto.email ?? null,
            phone: dto.phone ?? null,

            organizationName: dto.organizationName ?? null,

            source: dto.source ?? null,
            notes: dto.notes ?? null,

            ...(dto.status !== undefined && { status: dto.status }),
            assignedToId: dto.assignedToId ?? null,
          },
        });

        await auditCreate(tx, 'lead', companyId, audit, lead);
        return new LeadEntity(lead);
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async findAll(
    companyId: string,
    query: LeadQueryDto,
  ): Promise<LeadRepositoryResult> {
    const { page, limit } = PaginationUtil.getPagination(query);

    const prismaQuery = PrismaQueryBuilder.build(
      query,
      {
        searchableFields: [
          'firstName',
          'lastName',
          'email',
          'phone',
          'organizationName',
        ],

        sortableFields: [
          'firstName',
          'lastName',
          'email',
          'organizationName',
          'createdAt',
          'updatedAt',
          'status',
        ],

        selectableFields: [
          'id',
          'companyId',
          'firstName',
          'lastName',
          'email',
          'phone',
          'organizationName',
          'source',
          'status',
          'notes',
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

    const where: Prisma.LeadWhereInput = {
      ...(prismaQuery.where as Prisma.LeadWhereInput),

      ...(query.status !== undefined && {
        status: query.status,
      }),

      ...(query.assignedToId !== undefined && {
        assignedToId: query.assignedToId,
      }),
    };

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,

        orderBy: prismaQuery.orderBy,

        select: prismaQuery.select,

        skip: prismaQuery.skip,

        take: prismaQuery.take,
      }),

      this.prisma.lead.count({
        where,
      }),
    ]);

    return {
      data: leads.map((lead) => new LeadEntity(lead)),
      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async findById(
    companyId: string,
    leadId: string,
  ): Promise<LeadEntity | null> {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        companyId,
        deletedAt: null,
      },
    });

    if (!lead) {
      return null;
    }

    return new LeadEntity(lead);
  }

  async update(
    companyId: string,
    leadId: string,
    dto: UpdateLeadDto,
    audit: AuditActor,
  ): Promise<LeadEntity | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingLead = await tx.lead.findFirst({
          where: {
            id: leadId,
            companyId,
            deletedAt: null,
          },
        });

        if (!existingLead) {
          return null;
        }

        const lead = await tx.lead.update({
          where: {
            id: leadId,
            companyId,
            deletedAt: null,
          },

          data: {
            ...(dto.firstName !== undefined && {
              firstName: dto.firstName,
            }),

            ...(dto.lastName !== undefined && {
              lastName: dto.lastName,
            }),

            ...(dto.email !== undefined && {
              email: dto.email,
            }),

            ...(dto.phone !== undefined && {
              phone: dto.phone,
            }),

            ...(dto.organizationName !== undefined && {
              organizationName: dto.organizationName,
            }),

            ...(dto.source !== undefined && {
              source: dto.source,
            }),

            ...(dto.status !== undefined && {
              status: dto.status,
            }),

            ...(dto.notes !== undefined && {
              notes: dto.notes,
            }),

            ...(dto.assignedToId !== undefined && {
              assignedToId: dto.assignedToId,
            }),
          },
        });

        await auditUpdate(tx, 'lead', companyId, audit, existingLead, lead);
        return new LeadEntity(lead);
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async softDelete(
    companyId: string,
    leadId: string,
    audit: AuditActor,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.lead.findFirst({
          where: { id: leadId, companyId, deletedAt: null },
        });

        if (!existing) {
          return false;
        }

        const result = await tx.lead.updateMany({
          where: { id: leadId, companyId, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        if (result.count === 0) {
          return false;
        }

        await auditDelete(tx, 'lead', companyId, audit, existing);

        return true;
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}
