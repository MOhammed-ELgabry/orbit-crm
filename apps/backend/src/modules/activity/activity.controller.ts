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

import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@ApiTags('Activities')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('activities')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Post()
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'activity', action: 'create' })
  @ApiOperation({
    summary: 'Create activity',
    description:
      'Logs a new activity (note, call, email, meeting, ...) inside the authenticated tenant company.',
  })
  @ApiResponse({ status: 201, description: 'Activity created successfully.' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateActivityDto,
  ) {
    return this.activityService.create(req.user.companyId, req.user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get activities / timeline',
    description:
      "Returns a paginated, chronologically ordered timeline of activities scoped to the authenticated tenant company. Supports filtering by type, contact, and date range — e.g. pass contactId to get a single Contact's timeline.",
  })
  @ApiResponse({
    status: 200,
    description: 'Activities retrieved successfully.',
  })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: ActivityQueryDto,
  ) {
    return this.activityService.findAll(req.user.companyId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get activity by id',
    description:
      'Returns a single activity scoped to the authenticated tenant company.',
  })
  @ApiResponse({ status: 200, description: 'Activity retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Activity not found.' })
  async findById(
    @Req() req: AuthenticatedRequest,
    @Param('id') activityId: string,
  ) {
    return this.activityService.findById(req.user.companyId, activityId);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'activity', action: 'update' })
  @ApiOperation({
    summary: 'Update activity',
    description:
      'Updates an activity scoped to the authenticated tenant company.',
  })
  @ApiResponse({ status: 200, description: 'Activity updated successfully.' })
  @ApiResponse({ status: 404, description: 'Activity not found.' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.activityService.update(req.user.companyId, activityId, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'activity', action: 'delete' })
  @ApiOperation({
    summary: 'Delete activity',
    description:
      'Soft deletes an activity scoped to the authenticated tenant company.',
  })
  @ApiResponse({ status: 200, description: 'Activity deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Activity not found.' })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') activityId: string,
  ): Promise<void> {
    return this.activityService.remove(req.user.companyId, activityId);
  }
}
