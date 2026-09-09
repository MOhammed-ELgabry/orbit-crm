import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginationResult } from '../../common/interfaces/pagination-result.interface';

import { ROLE_REPOSITORY } from './constants/role.constants';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleEntity } from './entities/role.entity';
import type { IRoleRepository } from './repository/role.repository.interface';

@Injectable()
export class RoleService {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
  ) {}

  private async assertPermissionIdsExist(
    permissionIds?: string[],
  ): Promise<void> {
    if (!permissionIds?.length) {
      return;
    }

    const missing =
      await this.roleRepository.findMissingPermissionIds(permissionIds);

    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown permission id(s): ${missing.join(', ')}`,
      );
    }
  }

  async create(companyId: string, dto: CreateRoleDto): Promise<RoleEntity> {
    await this.assertPermissionIdsExist(dto.permissionIds);

    return this.roleRepository.create(companyId, dto);
  }

  async findAll(
    companyId: string,
    query: PaginationQueryDto,
  ): Promise<PaginationResult<RoleEntity>> {
    return this.roleRepository.findAll(companyId, query);
  }

  async findById(companyId: string, roleId: string): Promise<RoleEntity> {
    const role = await this.roleRepository.findById(companyId, roleId);

    if (!role) {
      throw new NotFoundException(`Role with ID "${roleId}" not found.`);
    }

    return role;
  }

  async update(
    companyId: string,
    roleId: string,
    dto: UpdateRoleDto,
  ): Promise<RoleEntity> {
    const existingRole = await this.roleRepository.findById(companyId, roleId);

    if (!existingRole) {
      throw new NotFoundException(`Role with ID "${roleId}" not found.`);
    }

    await this.assertPermissionIdsExist(dto.permissionIds);

    const updatedRole = await this.roleRepository.update(
      companyId,
      roleId,
      dto,
    );

    if (!updatedRole) {
      throw new NotFoundException(`Role with ID "${roleId}" not found.`);
    }

    return updatedRole;
  }

  async remove(companyId: string, roleId: string): Promise<void> {
    const deleted = await this.roleRepository.softDelete(companyId, roleId);

    if (!deleted) {
      throw new NotFoundException(`Role with ID "${roleId}" not found.`);
    }
  }
}
