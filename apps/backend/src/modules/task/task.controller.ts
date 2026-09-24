import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CsrfGuard } from '../../common/security/csrf.guard';
import { PermissionsGuard } from '../../common/security/permissions.guard';
import { RequirePermissions } from '../../common/security/permissions.decorator';

import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@ApiTags('Tasks')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'task', action: 'create' })
  @ApiOperation({
    summary: 'Create task',
    description: 'Creates a new task inside the authenticated tenant company.',
  })
  @ApiResponse({
    status: 201,
    description: 'Task created successfully.',
  })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTaskDto) {
    return this.taskService.create(req.user.companyId, req.user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get tasks',
    description:
      'Returns paginated tasks scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tasks retrieved successfully.',
  })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: TaskQueryDto,
  ) {
    return this.taskService.findAll(req.user.companyId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get task by id',
    description:
      'Returns a single task scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Task retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found.',
  })
  async findById(
    @Req() req: AuthenticatedRequest,
    @Param('id') taskId: string,
  ) {
    return this.taskService.findById(req.user.companyId, taskId);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'task', action: 'update' })
  @ApiOperation({
    summary: 'Update task',
    description:
      'Updates a task scoped to the authenticated tenant company. Also ' +
      'used for assignment (assignedToId) and status changes (status, ' +
      'including marking a task complete/cancelled) — there is no ' +
      'separate assign, complete, or close endpoint, matching Contact, ' +
      'Lead, and Deal.',
  })
  @ApiResponse({
    status: 200,
    description: 'Task updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found.',
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.taskService.update(
      req.user.companyId,
      taskId,
      dto,
      req.user.sub,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'task', action: 'delete' })
  @ApiOperation({
    summary: 'Delete task',
    description:
      'Soft deletes a task scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Task deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found.',
  })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') taskId: string,
  ): Promise<void> {
    return this.taskService.remove(req.user.companyId, taskId, req.user.sub);
  }
}
