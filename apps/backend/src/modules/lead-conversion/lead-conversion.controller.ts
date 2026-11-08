import { randomUUID } from 'crypto';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
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

import { auditActorFromRequest } from '../audit/audit-actor.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CsrfGuard } from '../../common/security/csrf.guard';
import { PermissionsGuard } from '../../common/security/permissions.guard';
import { RequirePermissions } from '../../common/security/permissions.decorator';

import { ConvertLeadDto } from './dto/convert-lead.dto';
import { LeadConversionService } from './lead-conversion.service';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

/**
 * Lead -> Contact conversion, driven from a WON Deal. Mounted under /deals
 * because the trigger is the Deal; the Lead is always the one the Deal
 * points at (the client never names a Lead).
 *
 * Authorization reuses the existing permission catalog — no new permission:
 * PermissionsGuard ANDs every permission passed to @RequirePermissions.
 */
@ApiTags('Lead conversion')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('deals')
export class LeadConversionController {
  constructor(private readonly leadConversionService: LeadConversionService) {}

  @Get(':id/lead-conversion/preview')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(
    { resource: 'deal', action: 'read' },
    { resource: 'lead', action: 'read' },
    { resource: 'contact', action: 'read' },
  )
  @ApiOperation({
    summary: 'Preview converting the lead of a won deal into a contact',
    description:
      "Read-only. Returns whether the deal can convert its lead, the contact that would be created, and any existing contacts of the same company that look like duplicates (same email or phone, or the deal's own contact).",
  })
  @ApiResponse({ status: 200, description: 'Preview computed.' })
  @ApiResponse({ status: 404, description: 'Deal not found.' })
  async preview(@Req() req: AuthenticatedRequest, @Param('id') dealId: string) {
    return this.leadConversionService.preview(req.user.companyId, dealId);
  }

  @Post(':id/lead-conversion')
  @HttpCode(200)
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions(
    { resource: 'deal', action: 'update' },
    { resource: 'lead', action: 'update' },
    { resource: 'contact', action: 'create' },
  )
  @ApiOperation({
    summary: 'Convert the lead of a won deal into a contact',
    description:
      'Explicit, user-confirmed conversion in one transaction. Creates a new contact or links to an existing one (never merging or overwriting it), marks the lead converted, points the deal (and the lead\'s other open records) at the contact and logs the conversion. Idempotent: repeating it returns outcome "already_converted" and creates nothing. Responds 200 for every outcome.',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversion completed (or already done).',
  })
  @ApiResponse({
    status: 400,
    description: 'The deal is not closed_won or has no lead.',
  })
  @ApiResponse({ status: 404, description: 'Deal, lead or contact not found.' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate contact, or the deal is linked to another contact.',
  })
  async convert(
    @Req() req: AuthenticatedRequest,
    @Param('id') dealId: string,
    @Body() dto: ConvertLeadDto,
  ) {
    return this.leadConversionService.convert(
      req.user.companyId,
      dealId,
      req.user.sub,
      dto,
      // One correlationId groups every audit row this conversion writes.
      auditActorFromRequest(req, { correlationId: randomUUID() }),
    );
  }
}
