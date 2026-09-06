import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';
import { PermissionRepository } from './repository/permission.repository';
import { PERMISSION_REPOSITORY } from './constants/permission.constants';

@Module({
  imports: [AuthModule],

  controllers: [PermissionController],

  providers: [
    PermissionService,

    {
      provide: PERMISSION_REPOSITORY,
      useClass: PermissionRepository,
    },

    JwtAuthGuard,
  ],

  exports: [PermissionService],
})
export class PermissionModule {}
