import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionEntity } from './entities/permission.entity';
import { PermissionService } from './permission.service';

@ApiTags('Permissions')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @ApiOperation({
    summary: 'List the permission catalog',
    description:
      'Returns the full, global set of (resource, action) permissions ' +
      'available to attach to a Role. Not tenant-scoped — every ' +
      'company sees the same catalog. Used to build the permission ' +
      'picker when an owner creates or edits a Role.',
  })
  @ApiOkResponse({ description: 'Permissions retrieved successfully.', type: [PermissionEntity] })
  async findAll(): Promise<PermissionEntity[]> {
    return this.permissionService.findAll();
  }
}