import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationResult } from '../../../common/interfaces/pagination-result.interface';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { RoleEntity } from '../entities/role.entity';

export interface IRoleRepository {
  create(companyId: string, dto: CreateRoleDto): Promise<RoleEntity>;

  findAll(
    companyId: string,
    query: PaginationQueryDto,
  ): Promise<PaginationResult<RoleEntity>>;

  findById(companyId: string, roleId: string): Promise<RoleEntity | null>;

  update(
    companyId: string,
    roleId: string,
    dto: UpdateRoleDto,
  ): Promise<RoleEntity | null>;

  softDelete(companyId: string, roleId: string): Promise<boolean>;

  /**
   * Returns the ids from `permissionIds` that do NOT exist in the global
   * Permission catalog — used to reject a create/update with a clear
   * error before touching the database, rather than letting an FK
   * violation surface as a generic 400 later.
   */
  findMissingPermissionIds(permissionIds: string[]): Promise<string[]>;
}