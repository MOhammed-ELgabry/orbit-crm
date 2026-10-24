import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PaginationResult } from '../../../common/interfaces/pagination-result.interface';
import { PaginationUtil } from '../../../common/utils/pagination.util';
import { PrismaQueryBuilder } from '../../../common/utils/prisma-query-builder.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { CreateCompanyDto } from '../dto/create-company.dto';
import { UpdateCompanyDto } from '../dto/update-company.dto';
import { CompanyEntity } from '../entities/company.entity';
import { auditDelete, auditUpdate } from '../../audit/audit.writer';
import type { AuditActor } from '../../audit/audit.types';
import { ICompanyRepository } from './company.repository.interface';

@Injectable()
export class CompanyRepository implements ICompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCompanyDto): Promise<CompanyEntity> {
    try {
      const company = await this.prisma.company.create({
        data,
      });

      return new CompanyEntity(company);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async findAll(
    query: PaginationQueryDto,
    companyId: string,
  ): Promise<PaginationResult<CompanyEntity>> {
    const { page, limit } = PaginationUtil.getPagination(query);

    const prismaQuery = PrismaQueryBuilder.build(
      query,
      {
        searchableFields: ['name', 'contactEmail'],

        sortableFields: [
          'name',
          'contactEmail',
          'createdAt',
          'updatedAt',
          'isActive',
        ],

        selectableFields: [
          'id',
          'name',
          'contactEmail',
          'phone',
          'address',
          'logo',
          'website',
          'taxNumber',
          'description',
          'businessType',
          'isActive',
          'createdAt',
          'updatedAt',
          'deletedAt',
        ] as const,

        filters: [
          {
            field: 'isActive',
            queryKey: 'isActive',
          },
        ],
      },
      {
        id: companyId,
        deletedAt: null,
      },
    );

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        where: prismaQuery.where,

        orderBy: prismaQuery.orderBy,

        select: prismaQuery.select,

        skip: prismaQuery.skip,

        take: prismaQuery.take,
      }),

      this.prisma.company.count({
        where: prismaQuery.where,
      }),
    ]);

    return {
      data: companies.map((company) => new CompanyEntity(company)),

      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async findById(id: string): Promise<CompanyEntity | null> {
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!company) {
      return null;
    }

    return new CompanyEntity(company);
  }

  async update(
    id: string,
    data: UpdateCompanyDto,
    audit: AuditActor,
  ): Promise<CompanyEntity> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.company.findUnique({ where: { id } });

        if (!before) {
          throw new NotFoundException('Record not found.');
        }

        const company = await tx.company.update({
          where: { id },
          data,
        });

        // The audit row belongs to the company being changed (`id`), which
        // the service has already proven equals the caller's own company.
        await auditUpdate(tx, 'company', id, audit, before, company);

        return new CompanyEntity(company);
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async delete(id: string, audit: AuditActor): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const before = await tx.company.findUnique({ where: { id } });

        if (!before) {
          throw new NotFoundException('Record not found.');
        }

        await tx.company.update({
          where: { id },
          data: {
            deletedAt: new Date(),
          },
        });

        await auditDelete(tx, 'company', id, audit, before);
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}
