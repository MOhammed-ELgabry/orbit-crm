import { ConflictException, Injectable } from '@nestjs/common';
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

  /**
   * Race-safe variant of create() that also enforces a per-company user
   * limit (see BASIC_PLAN_USER_LIMIT) and guarantees the created user
   * never has roleId: null — see the EMPLOYEE-role resolution inline
   * below for why that's resolved here rather than at the call site.
   *
   * Two concurrent calls for the same company can never both succeed
   * once the company is already at `limit`: pg_advisory_xact_lock blocks
   * a second concurrent transaction for the same companyId until the
   * first commits or rolls back, so the count below is never read while
   * another request's not-yet-committed creation could still change it —
   * exactly the same class of guarantee already used for refresh-token
   * rotation and the email-verification race fix elsewhere in this
   * codebase, just via an advisory lock instead of a conditional
   * updateMany, since there's no existing row to condition an update
   * on here (we're counting rows, not transitioning one).
   *
   * hashtext() collapses the cuid companyId to a 32-bit int (Postgres
   * implicitly widens it to bigint for pg_advisory_xact_lock's
   * single-argument form). An occasional hash collision between two
   * unrelated companies only costs a moment of unnecessary
   * serialization between them — the actual limit enforced below is
   * always the real companyId in the count's WHERE clause, so this
   * can never let two different companies interfere with each other's
   * counts, only very rarely make them briefly wait on each other.
   *
   * The lock is transaction-scoped (`_xact_`), not session-scoped, so
   * it is released automatically when this transaction commits or
   * rolls back — no manual unlock bookkeeping, and no risk of a lock
   * leaking across pooled connections.
   */
  async createWithinCompanyLimit(
    data: CreateUserRepositoryDto,
    limit: number,
  ): Promise<UserEntity> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${data.companyId})::bigint)`;

      const currentUserCount = await tx.user.count({
        where: {
          companyId: data.companyId,
          deletedAt: null,
        },
      });

      if (currentUserCount >= limit) {
        throw new ConflictException(
          `This company has reached its plan limit of ${limit} users.`,
        );
      }

      // A team member created through this path must never default to
      // PermissionsGuard's roleId: null compatibility shim (unrestricted
      // contact/activity access) — they get the company's own EMPLOYEE
      // role instead, the least-privileged default. Resolved here,
      // inside this same transaction, via the exact (companyId, name)
      // compound key ensureDefaultRolesForCompany already upserts on —
      // never by name alone, so this can never resolve to another
      // tenant's role. Not delegated to RoleService/RoleRepository:
      // those query through the injected PrismaService directly, not a
      // passed-in tx, so calling them here would run outside this
      // transaction and break the atomicity this method exists to
      // guarantee — the role lookup, the seat-limit check, and the
      // user creation all succeed or all roll back together.
      const employeeRole = await tx.role.findUnique({
        where: {
          companyId_name: {
            companyId: data.companyId,
            name: 'EMPLOYEE',
          },
        },
      });

      if (!employeeRole || employeeRole.deletedAt) {
        // Fail closed: never create a team member with roleId: null —
        // that is exactly the unrestricted state this change exists to
        // avoid. If the company's EMPLOYEE role is missing (seeding
        // never ran) or has been deleted, reject the whole creation
        // rather than silently falling back.
        throw new ConflictException(
          "This company's default EMPLOYEE role could not be found. " +
            'Team members cannot be created until it exists — contact support.',
        );
      }

      return this.createWithTransaction(tx, {
        ...data,
        roleId: employeeRole.id,
      });
    });
  }

  async findAll(
    query: PaginationQueryDto,
    companyId: string,
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
          'roleId',
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
        companyId,
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

  async findByIdAndCompany(
    id: string,
    companyId: string,
  ): Promise<UserEntity | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        companyId,
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
        avatar: true,
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

  async update(
    id: string,
    companyId: string,
    data: UpdateUserRepositoryDto,
  ): Promise<UserEntity> {
    try {
      const user = await this.prisma.user.update({
        where: {
          id,
          companyId,
        },
        data,
      });

      return new UserEntity(user);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async updateStatus(
    id: string,
    companyId: string,
    isActive: boolean,
  ): Promise<UserEntity> {
    try {
      const user = await this.prisma.user.update({
        where: {
          id,
          companyId,
        },
        data: {
          isActive,
        },
      });

      return new UserEntity(user);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async updateRole(
    id: string,
    companyId: string,
    roleId: string | null,
  ): Promise<UserEntity> {
    try {
      const user = await this.prisma.user.update({
        where: {
          id,
          companyId,
        },
        data: {
          roleId,
        },
      });

      return new UserEntity(user);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        passwordHash,
      },
    });
  }

  async delete(id: string, companyId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: {
          id,
          companyId,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}
