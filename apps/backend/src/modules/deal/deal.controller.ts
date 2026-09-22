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

import { DealService } from './deal.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealQueryDto } from './dto/deal-query.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@ApiTags('Deals')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('deals')
export class DealController {
  constructor(private readonly dealService: DealService) {}

  @Post()
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'deal', action: 'create' })
  @ApiOperation({
    summary: 'Create deal',
    description: 'Creates a new deal inside the authenticated tenant company.',
  })
  @ApiResponse({
    status: 201,
    description: 'Deal created successfully.',
  })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateDealDto) {
    return this.dealService.create(req.user.companyId, req.user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get deals',
    description:
      'Returns paginated deals scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deals retrieved successfully.',
  })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: DealQueryDto,
  ) {
    return this.dealService.findAll(req.user.companyId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get deal by id',
    description:
      'Returns a single deal scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deal retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Deal not found.',
  })
  async findById(
    @Req() req: AuthenticatedRequest,
    @Param('id') dealId: string,
  ) {
    return this.dealService.findById(req.user.companyId, dealId);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'deal', action: 'update' })
  @ApiOperation({
    summary: 'Update deal',
    description:
      'Updates a deal scoped to the authenticated tenant company. Also ' +
      'used for assignment (assignedToId) and stage changes (stage, ' +
      'including marking a deal won/lost) — there is no separate assign ' +
      'or close endpoint, matching Contact and Lead.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deal updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Deal not found.',
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') dealId: string,
    @Body() dto: UpdateDealDto,
  ) {
    return this.dealService.update(
      req.user.companyId,
      dealId,
      dto,
      req.user.sub,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'deal', action: 'delete' })
  @ApiOperation({
    summary: 'Delete deal',
    description: 'Soft deletes a deal scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deal deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Deal not found.',
  })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') dealId: string,
  ): Promise<void> {
    return this.dealService.remove(req.user.companyId, dealId, req.user.sub);
  }
}