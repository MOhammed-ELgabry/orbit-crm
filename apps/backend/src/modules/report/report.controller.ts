import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { RequirePermissions } from '../../common/security/permissions.decorator';
import { PermissionsGuard } from '../../common/security/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';

import { ReportPeriodQueryDto } from './dto/report-query.dto';
import { ReportService } from './report.service';

type AuthenticatedRequest = Request & { user: IJwtPayload };

/**
 * Read-only reports. There is no `report:*` permission: each report is
 * gated by the read permission of the data it summarises, so what a user
 * may see in a report never exceeds what they may already list.
 *
 * Reports are company-wide for anyone holding those read permissions (not
 * filtered to "assigned to me"), and `companyId` is ALWAYS taken from the
 * verified token (`req.user`), never from the query string.
 *
 * GET only — no CSRF guard is needed (nothing changes state).
 */
@ApiTags('Reports')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('pipeline-snapshot')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ resource: 'deal', action: 'read' })
  @ApiOperation({
    summary: 'Pipeline snapshot',
    description:
      'Current open deals (count and value, by stage) as of now, plus — separately — deals created inside the requested range.',
  })
  @ApiResponse({ status: 200, description: 'Report computed.' })
  async pipelineSnapshot(
    @Req() req: AuthenticatedRequest,
    @Query() query: ReportPeriodQueryDto,
  ) {
    return this.reportService.getPipelineSnapshot(req.user.companyId, query);
  }

  @Get('leads-overview')
  // Both permissions: the "leads with a linked deal" metric exposes
  // company-wide deal linkage, so it is only served to users who could
  // also read deals. Every default role has both.
  @UseGuards(PermissionsGuard)
  @RequirePermissions(
    { resource: 'lead', action: 'read' },
    { resource: 'deal', action: 'read' },
  )
  @ApiOperation({
    summary: 'Leads overview',
    description:
      'Leads created inside the range: current status split, source split and how many have a linked deal.',
  })
  @ApiResponse({ status: 200, description: 'Report computed.' })
  async leadsOverview(
    @Req() req: AuthenticatedRequest,
    @Query() query: ReportPeriodQueryDto,
  ) {
    return this.reportService.getLeadsOverview(req.user.companyId, query);
  }

  @Get('tasks-overview')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ resource: 'task', action: 'read' })
  @ApiOperation({
    summary: 'Tasks overview',
    description:
      'Tasks due inside the range: status split and completion rate (cancelled tasks excluded from the denominator). Tasks with no due date are reported separately.',
  })
  @ApiResponse({ status: 200, description: 'Report computed.' })
  async tasksOverview(
    @Req() req: AuthenticatedRequest,
    @Query() query: ReportPeriodQueryDto,
  ) {
    return this.reportService.getTasksOverview(req.user.companyId, query);
  }
}
