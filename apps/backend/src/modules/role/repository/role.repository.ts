import { Injectable } from '@nestjs/common';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PrismaExceptionMapper } from '../../../common/exceptions/prisma-exception.mapper';
import { PaginationResult } from '../../../common/interfaces/pagination-result.interface';
import { PaginationUtil } from '../../../common/utils/pagination.util';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { RoleEntity } from '../entities/role.entity';
import { IRoleRepository } from './role.repository.interface';

const ROLE_INCLUDE = {
  rolePermissions: { include: { permission: true } },
} as const;

type RoleWithPermissions = {
  id: string;
  name: string;
  description: string | null;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
  rolePermissions: {
    permission: { id: string; resource: string; action: string };
  }[];
};

const ROLE_SORTABLE_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;

@Injectable()
export class RoleRepository implements IRoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(role: RoleWithPermissions): RoleEntity {
    return new RoleEntity({
      id: role.id,
      name: role.name,
      description: role.description,
      companyId: role.companyId,
      permissions: role.rolePermissions.map((rp) => ({
        id: rp.permission.id,
        resource: rp.permission.resource,
        action: rp.permission.action,
      })),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    });
  }

  async findMissingPermissionIds(permissionIds: string[]): Promise<string[]> {
    if (permissionIds.length === 0) {
      return [];
    }

    const found = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true },
    });

    const foundIds = new Set(found.map((permission) => permission.id));

    return permissionIds.filter((id) => !foundIds.has(id));
  }

  async create(companyId: string, dto: CreateRoleDto): Promise<RoleEntity> {
    try {
      const role = await this.prisma.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: {
            name: dto.name,
            description: dto.description ?? null,
            companyId,
          },
        });

        if (dto.permissionIds?.length) {
          await tx.rolePermission.createMany({
            data: dto.permissionIds.map((permissionId) => ({
              roleId: created.id,
              permissionId,
            })),
          });
        }

        return tx.role.findUniqueOrThrow({
          where: { id: created.id },
          include: ROLE_INCLUDE,
        });
      });

      return this.toEntity(role);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async findAll(
    companyId: string,
    query: PaginationQueryDto,
  ): Promise<PaginationResult<RoleEntity>> {
    const { page, limit, skip, take } = PaginationUtil.getPagination(query);

    const where = {
      companyId,
      deletedAt: null,
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' as const },
      }),
    };

    const sortBy =
      query.sortBy &&
      (ROLE_SORTABLE_FIELDS as readonly string[]).includes(query.sortBy)
        ? query.sortBy
        : 'name';

    const [roles, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        orderBy: { [sortBy]: query.sortOrder },
        include: ROLE_INCLUDE,
        skip,
        take,
      }),

      this.prisma.role.count({ where }),
    ]);

    return {
      data: roles.map((role) => this.toEntity(role)),
      meta: PaginationUtil.buildMeta(page, limit, total),
    };
  }

  async findById(
    companyId: string,
    roleId: string,
  ): Promise<RoleEntity | null> {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, companyId, deletedAt: null },
      include: ROLE_INCLUDE,
    });

    if (!role) {
      return null;
    }

    return this.toEntity(role);
  }

  async update(
    companyId: string,
    roleId: string,
    dto: UpdateRoleDto,
  ): Promise<RoleEntity | null> {
    try {
      const existing = await this.prisma.role.findFirst({
        where: { id: roleId, companyId, deletedAt: null },
        select: { id: true },
      });

      if (!existing) {
        return null;
      }

      const role = await this.prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id: roleId, companyId },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.description !== undefined && {
              description: dto.description,
            }),
          },
        });

        if (dto.permissionIds !== undefined) {
          // Replace, not merge — matches UpdateRoleDto's documented
          // contract. Deleting then recreating (rather than diffing) is
          // simplest and correct: RolePermission's only extra column is
          // createdAt, which we're fine resetting on any permission-set
          // change.
          await tx.rolePermission.deleteMany({ where: { roleId } });

          if (dto.permissionIds.length) {
            await tx.rolePermission.createMany({
              data: dto.permissionIds.map((permissionId) => ({
                roleId,
                permissionId,
              })),
            });
          }
        }

        return tx.role.findUniqueOrThrow({
          where: { id: roleId },
          include: ROLE_INCLUDE,
        });
      });

      return this.toEntity(role);
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }

  async softDelete(companyId: string, roleId: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const result = await tx.role.updateMany({
          where: { id: roleId, companyId, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        if (result.count === 0) {
          return false;
        }

        // Unassign the deleted role from anyone who had it rather than
        // leaving a dangling reference. PermissionsGuard treats a roleId
        // that no longer resolves to a live Role as "denied" (fail
        // closed), so without this a deleted role would silently lock
        // its former holders out of every permission-gated action
        // instead of returning them to the default (no role assigned)
        // access level.
        await tx.user.updateMany({
          where: { roleId, companyId },
          data: { roleId: null },
        });

        return true;
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }
  }
}
