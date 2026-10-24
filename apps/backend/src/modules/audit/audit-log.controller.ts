import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';

import { AuditOwnerGuard } from './audit-owner.guard';
import { AuditQueryService } from './audit-query.service';
import { VerifiedAuditScope, type AuditScope } from './audit-scope';
import {
  AuditLogIdParamDto,
  AuditLogQueryDto,
} from './dto/audit-log-query.dto';

/**
 * Owner-only, READ-ONLY audit log API.
 *
 * Only GET routes exist: there is no route that creates, edits, deletes or
 * exports audit rows (a spec asserts this). Guards run in order:
 * JwtAuthGuard (authentication + active account) → OwnerGuard (existing
 * Owner rule, unchanged) → AuditOwnerGuard (re-verifies Owner + company in the
 * database and produces the AuditScope). Responses are never cached.
 */
@ApiTags('Audit Log')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, OwnerGuard, AuditOwnerGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List audit log entries (Owner only)',
    description:
      "Paginated, filterable entries of the Owner's own company. Max period 90 days.",
  })
  list(
    @VerifiedAuditScope() scope: AuditScope,
    @Query() query: AuditLogQueryDto,
  ) {
    return this.auditQueryService.list(scope, query);
  }

  // Declared before ':id' so "actors" is never treated as an id.
  @Get('actors')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Actors present in the log (Owner only)' })
  listActors(@VerifiedAuditScope() scope: AuditScope) {
    return this.auditQueryService.listActors(scope);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Audit log entry details (Owner only)' })
  getOne(
    @VerifiedAuditScope() scope: AuditScope,
    @Param() params: AuditLogIdParamDto,
  ) {
    return this.auditQueryService.getById(scope, params.id);
  }
}
