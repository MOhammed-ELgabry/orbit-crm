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
} from '@nestjs/common';

import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserEntity } from './entities/user.entity';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({
    summary: 'Create a new user',
    description: 'Creates a new user and returns the created user.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully.',
    type: UserEntity,
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @ApiOperation({
    summary: 'Get all users',
    description: 'Returns a paginated list of users.',
  })
  @ApiOkResponse({
    description: 'Users retrieved successfully.',
  })
  @Get()
  async findAll(@Query() query: PaginationQueryDto) {
    return this.userService.findAll(query);
  }

  @ApiOperation({
    summary: 'Get user by id',
    description: 'Returns a single user by identifier.',
  })
  @ApiOkResponse({
    description: 'User retrieved successfully.',
    type: UserEntity,
  })
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @ApiOperation({
    summary: 'Update user',
    description: 'Updates an existing user and returns the updated user.',
  })
  @ApiOkResponse({
    description: 'User updated successfully.',
    type: UserEntity,
  })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @ApiOperation({
    summary: 'Delete user',
    description: 'Soft deletes a user by identifier.',
  })
  @ApiOkResponse({
    description: 'User deleted successfully.',
  })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string) {
    return this.userService.delete(id);
  }
}
