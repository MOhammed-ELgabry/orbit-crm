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

import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { CalendarEventQueryDto } from './dto/calendar-event-query.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@ApiTags('Calendar')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post()
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'calendar', action: 'create' })
  @ApiOperation({
    summary: 'Create calendar event',
    description:
      'Creates a new calendar event inside the authenticated tenant company.',
  })
  @ApiResponse({
    status: 201,
    description: 'Calendar event created successfully.',
  })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.create(req.user.companyId, req.user.sub, dto);
  }

  /**
   * calendar:read is enforced here and on findById below — unlike
   * Contact/Lead/Deal/Task/Activity's own GET routes, which currently
   * carry no permission check beyond authentication. That is a
   * deliberate, Calendar-specific choice (see the read-enforcement
   * decision recorded for this module), not an oversight and not a
   * change to how those other modules behave.
   */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ resource: 'calendar', action: 'read' })
  @ApiOperation({
    summary: 'Get calendar events',
    description:
      'Returns calendar events in the given date range, scoped to the ' +
      'authenticated tenant company. from/to are both required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Calendar events retrieved successfully.',
  })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: CalendarEventQueryDto,
  ) {
    return this.calendarService.findAll(req.user.companyId, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ resource: 'calendar', action: 'read' })
  @ApiOperation({
    summary: 'Get calendar event by id',
    description:
      'Returns a single calendar event scoped to the authenticated ' +
      'tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Calendar event retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Calendar event not found.',
  })
  async findById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.calendarService.findById(req.user.companyId, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'calendar', action: 'update' })
  @ApiOperation({
    summary: 'Update calendar event',
    description:
      'Updates a calendar event scoped to the authenticated tenant ' +
      'company. Also used for assignment (assignedToId) and status ' +
      'changes (status, including marking an event complete/' +
      'cancelled) — there is no separate assign, complete, or close ' +
      'endpoint, matching Task.',
  })
  @ApiResponse({
    status: 200,
    description: 'Calendar event updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Calendar event not found.',
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.update(
      req.user.companyId,
      id,
      dto,
      req.user.sub,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'calendar', action: 'delete' })
  @ApiOperation({
    summary: 'Delete calendar event',
    description:
      'Soft deletes a calendar event scoped to the authenticated ' +
      'tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Calendar event deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Calendar event not found.',
  })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    return this.calendarService.remove(req.user.companyId, id, req.user.sub);
  }
}
