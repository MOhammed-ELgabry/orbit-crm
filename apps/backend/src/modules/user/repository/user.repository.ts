import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { UpdateUserRepositoryDto } from '../dto/update-user-repository.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PaginationResult } from '../../../common/interfaces/pagination-result.interface';
import { PaginationUtil } from '../../../common/utils/pagination.util';
import { PrismaQueryBuilder } from '../../../common/utils/prisma-query-builder.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { CreateUserRepositoryDto } from '../dto/create-user-repository.dto';
import { UserEntity } from '../entities/user.entity';
import { IUserRepository } from './user.repository.interface';
import { IAuthUser } from '../../auth/interfaces/auth-user.interface';
@Injectable()
export class UserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserRepositoryDto): Promise<UserEntity> {
    try {
      const user = await this.prisma.user.create({
        data,
      });

      return new UserEntity(user);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async createWithTransaction(
    tx: Prisma.TransactionClient,
    data: CreateUserRepositoryDto,
  ): Promise<UserEntity> {
    try {
      const user = await tx.user.create({
        data,
      });

      return new UserEntity(user);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginationResult<UserEntity>> {
    const { page, limit } = PaginationUtil.getPagination(query);

    const prismaQuery = PrismaQueryBuilder.build(
      query,
      {
        searchableFields: ['firstName', 'lastName', 'email'],

        sortableFields: [
          'firstName',
          'lastName',
          'email',
          'createdAt',
          'updatedAt',
          'isActive',
        ],

        selectableFields: [
          'id',
          'firstName',
          'lastName',
          'email',
          'phone',
          'avatar',
          'isActive',
          'isOwner',
          'lastLoginAt',
          'companyId',
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
        deletedAt: null,
      },
    );

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: prismaQuery.where as Prisma.UserWhereInput,

        orderBy: prismaQuery.orderBy,

        select: prismaQuery.select,

        skip: prismaQuery.skip,

        take: prismaQuery.take,
      }),

      this.prisma.user.count({
        where: prismaQuery.where as Prisma.UserWhereInput,
      }),
    ]);

    return {
      data: users.map((user) => new UserEntity(user)),

      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async findById(id: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!user) {
      return null;
    }

    return new UserEntity(user);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });

    if (!user) {
      return null;
    }

    return new UserEntity(user);
  }

  async findForAuthByEmail(email: string): Promise<IAuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },

      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        passwordHash: true,
        isActive: true,
        isEmailVerified: true,
        isOwner: true,
        companyId: true,
      },
    });

    if (!user) {
      return null;
    }

    return user;
  }

  async update(id: string, data: UpdateUserRepositoryDto): Promise<UserEntity> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
      });

      return new UserEntity(user);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}
