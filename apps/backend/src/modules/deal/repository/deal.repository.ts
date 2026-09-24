import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PaginationUtil } from '../../../common/utils/pagination.util';
import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaQueryBuilder } from '../../../common/utils/prisma-query-builder.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { CreateDealDto } from '../dto/create-deal.dto';
import { DealQueryDto } from '../dto/deal-query.dto';
import { UpdateDealDto } from '../dto/update-deal.dto';
import { DealEntity } from '../entities/deal.entity';

import {
  IDealRepository,
  DealRepositoryResult,
} from './deal.repository.interface';

// Local shape for whatever Prisma hands back from deal.create/findFirst/
// findMany/update — just enough to convert amount (Prisma.Decimal) to
// the string DealEntity expects. Avoids importing the generated Deal
// model type here, matching how the rest of this repository (and
// LeadRepository) stays untyped against Prisma's generated model types
// beyond Prisma.DealWhereInput.
type RawDeal = Omit<DealEntity, 'amount'> & {
  amount?: { toString(): string };
};

function toEntity(deal: RawDeal): DealEntity {
  const { amount, ...rest } = deal;

  return new DealEntity({
    ...rest,
    ...(amount !== undefined && {
      amount: amount.toString(),
    }),
  });
}
@Injectable()
export class DealRepository implements IDealRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    createdById: string,
    dto: CreateDealDto,
  ): Promise<DealEntity> {
    try {
      const deal = await this.prisma.deal.create({
        data: {
          companyId,
          createdById,

          title: dto.title,

          ...(dto.amount !== undefined && { amount: dto.amount }),
          ...(dto.stage !== undefined && { stage: dto.stage }),

          notes: dto.notes ?? null,

          expectedCloseDate: dto.expectedCloseDate
            ? new Date(dto.expectedCloseDate)
            : null,

          contactId: dto.contactId ?? null,
          leadId: dto.leadId ?? null,
          assignedToId: dto.assignedToId ?? null,
        },
      });

      return toEntity(deal);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async findAll(
    companyId: string,
    query: DealQueryDto,
  ): Promise<DealRepositoryResult> {
    const { page, limit } = PaginationUtil.getPagination(query);

    const prismaQuery = PrismaQueryBuilder.build(
      query,
      {
        searchableFields: ['title', 'notes'],

        sortableFields: [
          'title',
          'amount',
          'stage',
          'expectedCloseDate',
          'createdAt',
          'updatedAt',
        ],

        selectableFields: [
          'id',
          'companyId',
          'title',
          'amount',
          'stage',
          'notes',
          'expectedCloseDate',
          'contactId',
          'leadId',
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

    const where: Prisma.DealWhereInput = {
      ...(prismaQuery.where as Prisma.DealWhereInput),

      ...(query.stage !== undefined && {
        stage: query.stage,
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
    };

    const [deals, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,

        orderBy: prismaQuery.orderBy,

        select: prismaQuery.select,

        skip: prismaQuery.skip,

        take: prismaQuery.take,
      }),

      this.prisma.deal.count({
        where,
      }),
    ]);

    return {
      // A narrowed `select` may omit `amount` entirely (the `fields`
      // query param) — toEntity only needs it to exist when present, so
      // this cast is safe: DealEntity's own fields all stay optional-safe
      // via Object.assign, exactly like LeadEntity/ContactEntity already
      // do for the same narrowed-select case.
      data: deals.map((deal) => toEntity(deal as RawDeal)),
      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async findById(
    companyId: string,
    dealId: string,
  ): Promise<DealEntity | null> {
    const deal = await this.prisma.deal.findFirst({
      where: {
        id: dealId,
        companyId,
        deletedAt: null,
      },
    });

    if (!deal) {
      return null;
    }

    return toEntity(deal);
  }

  async update(
    companyId: string,
    dealId: string,
    dto: UpdateDealDto,
  ): Promise<DealEntity | null> {
    try {
      const existingDeal = await this.prisma.deal.findFirst({
        where: {
          id: dealId,
          companyId,
          deletedAt: null,
        },
      });

      if (!existingDeal) {
        return null;
      }

      const deal = await this.prisma.deal.update({
        where: {
          id: dealId,
          companyId,
          deletedAt: null,
        },

        data: {
          ...(dto.title !== undefined && {
            title: dto.title,
          }),

          ...(dto.amount !== undefined && {
            amount: dto.amount,
          }),

          ...(dto.stage !== undefined && {
            stage: dto.stage,
          }),

          ...(dto.notes !== undefined && {
            notes: dto.notes,
          }),

          ...(dto.expectedCloseDate !== undefined && {
            expectedCloseDate: dto.expectedCloseDate
              ? new Date(dto.expectedCloseDate)
              : null,
          }),

          ...(dto.contactId !== undefined && {
            contactId: dto.contactId,
          }),

          ...(dto.leadId !== undefined && {
            leadId: dto.leadId,
          }),

          ...(dto.assignedToId !== undefined && {
            assignedToId: dto.assignedToId,
          }),
        },
      });

      return toEntity(deal);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async softDelete(companyId: string, dealId: string): Promise<boolean> {
    try {
      const result = await this.prisma.deal.updateMany({
        where: {
          id: dealId,
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
