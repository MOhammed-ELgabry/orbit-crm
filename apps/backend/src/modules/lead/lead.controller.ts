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

import { LeadService } from './lead.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@ApiTags('Leads')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'lead', action: 'create' })
  @ApiOperation({
    summary: 'Create lead',
    description: 'Creates a new lead inside the authenticated tenant company.',
  })
  @ApiResponse({
    status: 201,
    description: 'Lead created successfully.',
  })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateLeadDto) {
    return this.leadService.create(req.user.companyId, req.user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get leads',
    description:
      'Returns paginated leads scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Leads retrieved successfully.',
  })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: LeadQueryDto,
  ) {
    return this.leadService.findAll(req.user.companyId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get lead by id',
    description:
      'Returns a single lead scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lead retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Lead not found.',
  })
  async findById(
    @Req() req: AuthenticatedRequest,
    @Param('id') leadId: string,
  ) {
    return this.leadService.findById(req.user.companyId, leadId);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'lead', action: 'update' })
  @ApiOperation({
    summary: 'Update lead',
    description:
      'Updates a lead scoped to the authenticated tenant company. Also used ' +
      'for assignment (assignedToId) and status changes (status) — there is ' +
      'no separate assign/status endpoint, matching Contact.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lead updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Lead not found.',
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') leadId: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadService.update(req.user.companyId, leadId, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'lead', action: 'delete' })
  @ApiOperation({
    summary: 'Delete lead',
    description:
      'Soft deletes a lead scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lead deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Lead not found.',
  })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') leadId: string,
  ): Promise<void> {
    return this.leadService.remove(req.user.companyId, leadId);
  }
}
