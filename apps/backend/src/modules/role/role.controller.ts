import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginationResult } from '../../common/interfaces/pagination-result.interface';
import { CsrfGuard } from '../../common/security/csrf.guard';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';

import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleEntity } from './entities/role.entity';
import { RoleService } from './role.service';

type AuthenticatedRequest = Request & { user: IJwtPayload };

/**
 * Role management is owner-only, matching UserController's existing
 * convention for sensitive tenant-administration actions (updateStatus,
 * delete) — whoever can grant/revoke what a role can do must already be
 * fully trusted within the company. This is intentionally simpler than a
 * "requires role:manage permission" check: that would let a role grant
 * itself broader permissions than its own, a privilege-escalation path
 * this sidesteps entirely by keeping role administration itself outside
 * the permission system it manages.
 */
@ApiTags('Roles')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, OwnerGuard)
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Create a role',
    description: 'Owner-only. Creates a role scoped to the authenticated tenant company.',
  })
  @ApiOkResponse({ description: 'Role created successfully.', type: RoleEntity })
  @ApiForbiddenResponse({ description: 'Owner privileges are required for this operation.' })
  async create(
    @Body() dto: CreateRoleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoleEntity> {
    return this.roleService.create(request.user.companyId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List roles',
    description: 'Owner-only. Returns paginated roles scoped to the authenticated tenant company.',
  })
  @ApiOkResponse({ description: 'Roles retrieved successfully.' })
  async findAll(
    @Query() query: PaginationQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaginationResult<RoleEntity>> {
    return this.roleService.findAll(request.user.companyId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get role by id',
    description: 'Owner-only. Returns a single role scoped to the authenticated tenant company.',
  })
  @ApiOkResponse({ description: 'Role retrieved successfully.', type: RoleEntity })
  @ApiNotFoundResponse({ description: 'Role not found.' })
  async findById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoleEntity> {
    return this.roleService.findById(request.user.companyId, id);
  }

  @Patch(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Update a role',
    description:
      'Owner-only. Renames/redescribes a role and/or replaces its permission set.',
  })
  @ApiOkResponse({ description: 'Role updated successfully.', type: RoleEntity })
  @ApiNotFoundResponse({ description: 'Role not found.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoleEntity> {
    return this.roleService.update(request.user.companyId, id, dto);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a role',
    description:
      'Owner-only. Soft deletes a role and unassigns it from any user who had it.',
  })
  @ApiOkResponse({ description: 'Role deleted successfully.' })
  @ApiNotFoundResponse({ description: 'Role not found.' })
  async remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.roleService.remove(request.user.companyId, id);
  }
}