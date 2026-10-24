import {
  Body,
  Controller,
  HttpCode,
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

import { ContactImportService } from './contact-import.service';
import { ImportContactsDto } from './dto/import-contacts.dto';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

/**
 * Bulk import of contacts parsed from an Excel/CSV file in the browser.
 *
 * Authorization is exactly the existing "create contact" gate
 * (contact:create) with the same guard order the rest of the contacts module
 * uses; no permission, role or guard was added or changed for this feature.
 * companyId and the acting user come from the JWT only.
 */
@ApiTags('Contacts')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('contacts/import')
export class ContactImportController {
  constructor(private readonly contactImportService: ContactImportService) {}

  @Post('validate')
  @HttpCode(200)
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'contact', action: 'create' })
  @ApiOperation({
    summary: 'Validate contacts import rows (dry run)',
    description:
      'Validates up to 100 rows with the same rules as POST /contacts and reports which rows are valid, duplicates (email already used in the company or repeated in the request) or invalid. Nothing is written.',
  })
  @ApiResponse({ status: 200, description: 'Per-row validation result.' })
  async validate(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ImportContactsDto,
  ) {
    return this.contactImportService.validate(req.user.companyId, dto.rows);
  }

  @Post()
  @HttpCode(200)
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions({ resource: 'contact', action: 'create' })
  @ApiOperation({
    summary: 'Import contacts',
    description:
      'Creates up to 100 contacts through ContactService.create. Rows that are invalid or duplicate are skipped; the response reports the outcome of every row (partial success is possible).',
  })
  @ApiResponse({ status: 200, description: 'Per-row import outcome.' })
  async import(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ImportContactsDto,
  ) {
    return this.contactImportService.import(
      req.user.companyId,
      req.user.sub,
      dto.rows,
      auditActorFromRequest(req),
    );
  }
}
