import { PermissionEntity } from '../entities/permission.entity';

export interface IPermissionRepository {
  /**
   * The Permission catalog is global (not tenant-owned — see
   * schema.prisma), so this deliberately takes no companyId. Every
   * tenant sees the same fixed list and picks from it when building a
   * Role.
   */
  findAll(): Promise<PermissionEntity[]>;
}
