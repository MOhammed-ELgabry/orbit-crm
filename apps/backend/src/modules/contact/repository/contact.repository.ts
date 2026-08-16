import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PaginationUtil } from '../../../common/utils/pagination.util';
import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PrismaQueryBuilder } from '../../../common/utils/prisma-query-builder.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { CreateContactDto } from '../dto/create-contact.dto';
import { ContactQueryDto } from '../dto/contact-query.dto';
import { UpdateContactDto } from '../dto/update-contact.dto';
import { ContactEntity } from '../entities/contact.entity';

import {
  ContactRepositoryResult,
  IContactRepository,
} from './contact.repository.interface';

@Injectable()
export class ContactRepository implements IContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    createdById: string,
    dto: CreateContactDto,
  ): Promise<ContactEntity> {
    try {
      const contact = await this.prisma.contact.create({
        data: {
          companyId,
          createdById,

          firstName: dto.firstName,
          lastName: dto.lastName,

          email: dto.email ?? null,
          phone: dto.phone ?? null,
          mobile: dto.mobile ?? null,

          jobTitle: dto.jobTitle ?? null,
          organizationName: dto.organizationName ?? null,
          website: dto.website ?? null,

          address: dto.address ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          country: dto.country ?? null,
          postalCode: dto.postalCode ?? null,

          notes: dto.notes ?? null,
          source: dto.source ?? null,

          ...(dto.status !== undefined && { status: dto.status }),
          assignedToId: dto.assignedToId ?? null,
        },
      });

      return new ContactEntity(contact);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async findAll(
    companyId: string,
    query: ContactQueryDto,
  ): Promise<ContactRepositoryResult> {
    const { page, limit } = PaginationUtil.getPagination(query);

    const prismaQuery = PrismaQueryBuilder.build(
      query,
      {
        searchableFields: [
          'firstName',
          'lastName',
          'email',
          'phone',
          'mobile',
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
          'mobile',
          'jobTitle',
          'organizationName',
          'website',
          'address',
          'city',
          'state',
          'country',
          'postalCode',
          'notes',
          'source',
          'status',
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

    const where: Prisma.ContactWhereInput = {
      ...(prismaQuery.where as Prisma.ContactWhereInput),

      ...(query.status !== undefined && {
        status: query.status,
      }),

      ...(query.assignedToId !== undefined && {
        assignedToId: query.assignedToId,
      }),
    };

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,

        orderBy: prismaQuery.orderBy,

        select: prismaQuery.select,

        skip: prismaQuery.skip,

        take: prismaQuery.take,
      }),

      this.prisma.contact.count({
        where,
      }),
    ]);

    return {
      data: contacts.map((contact) => new ContactEntity(contact)),
      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async findById(
    companyId: string,
    contactId: string,
  ): Promise<ContactEntity | null> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        companyId,
        deletedAt: null,
      },
    });

    if (!contact) {
      return null;
    }

    return new ContactEntity(contact);
  }

  async update(
    companyId: string,
    contactId: string,
    dto: UpdateContactDto,
  ): Promise<ContactEntity | null> {
    try {
      const existingContact = await this.prisma.contact.findFirst({
        where: {
          id: contactId,
          companyId,
          deletedAt: null,
        },
      });

      if (!existingContact) {
        return null;
      }

      const contact = await this.prisma.contact.update({
        where: {
          id: contactId,
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

          ...(dto.mobile !== undefined && {
            mobile: dto.mobile,
          }),

          ...(dto.jobTitle !== undefined && {
            jobTitle: dto.jobTitle,
          }),

          ...(dto.organizationName !== undefined && {
            organizationName: dto.organizationName,
          }),

          ...(dto.website !== undefined && {
            website: dto.website,
          }),

          ...(dto.address !== undefined && {
            address: dto.address,
          }),

          ...(dto.city !== undefined && {
            city: dto.city,
          }),

          ...(dto.state !== undefined && {
            state: dto.state,
          }),

          ...(dto.country !== undefined && {
            country: dto.country,
          }),

          ...(dto.postalCode !== undefined && {
            postalCode: dto.postalCode,
          }),

          ...(dto.notes !== undefined && {
            notes: dto.notes,
          }),

          ...(dto.source !== undefined && {
            source: dto.source,
          }),

          ...(dto.status !== undefined && {
            status: dto.status,
          }),

          ...(dto.assignedToId !== undefined && {
            assignedToId: dto.assignedToId,
          }),
        },
      });

      return new ContactEntity(contact);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async softDelete(companyId: string, contactId: string): Promise<boolean> {
    try {
      const result = await this.prisma.contact.updateMany({
        where: {
          id: contactId,
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

  async existsByEmail(
    companyId: string,
    email: string,
    excludeContactId?: string,
  ): Promise<boolean> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        companyId,
        email,
        deletedAt: null,

        ...(excludeContactId && {
          id: {
            not: excludeContactId,
          },
        }),
      },

      select: {
        id: true,
      },
    });

    return contact !== null;
  }
}
