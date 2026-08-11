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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserEntity } from './entities/user.entity';
import { UserService } from './user.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@ApiTags('Users')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({
    summary: 'Create a new user',
    description: 'Creates a new user within the authenticated tenant company.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully.',
    type: UserEntity,
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.create(dto, request.user.companyId);
  }

  @ApiOperation({
    summary: 'Get all users',
    description:
      'Returns a paginated list of users belonging to the authenticated tenant company.',
  })
  @ApiOkResponse({
    description: 'Users retrieved successfully.',
  })
  @Get()
  async findAll(
    @Query() query: PaginationQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.findAll(query, request.user.companyId);
  }

  @ApiOperation({
    summary: 'Get user by id',
    description:
      'Returns a single user by identifier, scoped to the authenticated tenant company.',
  })
  @ApiOkResponse({
    description: 'User retrieved successfully.',
    type: UserEntity,
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.findById(id, request.user.companyId);
  }

  @ApiOperation({
    summary: 'Update user profile',
    description:
      'Updates profile fields for a user belonging to the authenticated tenant company.',
  })
  @ApiOkResponse({
    description: 'User updated successfully.',
    type: UserEntity,
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.update(id, dto, request.user.companyId);
  }

  @ApiOperation({
    summary: 'Update user active status',
    description:
      'Owner-only. Activates or deactivates a user belonging to the authenticated tenant company.',
  })
  @ApiOkResponse({
    description: 'User status updated successfully.',
    type: UserEntity,
  })
  @ApiForbiddenResponse({
    description: 'Owner privileges are required for this operation.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Patch(':id/status')
  @UseGuards(OwnerGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.updateStatus(id, dto, request.user.companyId);
  }

  @ApiOperation({
    summary: 'Delete user',
    description:
      'Owner-only. Soft deletes a user belonging to the authenticated tenant company.',
  })
  @ApiOkResponse({
    description: 'User deleted successfully.',
  })
  @ApiForbiddenResponse({
    description: 'Owner privileges are required for this operation.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Delete(':id')
  @UseGuards(OwnerGuard)
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.userService.delete(id, request.user.companyId);
  }
}
