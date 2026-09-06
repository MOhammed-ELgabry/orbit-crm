import { Inject, Injectable } from '@nestjs/common';

import { PERMISSION_REPOSITORY } from './constants/permission.constants';
import { PermissionEntity } from './entities/permission.entity';
import type { IPermissionRepository } from './repository/permission.repository.interface';

@Injectable()
export class PermissionService {
  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepository: IPermissionRepository,
  ) {}

  async findAll(): Promise<PermissionEntity[]> {
    return this.permissionRepository.findAll();
  }
}
