import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PermissionEntity } from '../entities/permission.entity';
import { IPermissionRepository } from './permission.repository.interface';

@Injectable()
export class PermissionRepository implements IPermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PermissionEntity[]> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });

    return permissions.map((permission) => new PermissionEntity(permission));
  }
}
