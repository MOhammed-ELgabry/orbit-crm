import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { CsrfGuard } from '../../common/security/csrf.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AuditActor } from '../audit/audit.types';

import { resolveClientIp } from './client-ip.util';
import { ConfirmRegionalSettingsDto } from './dto/confirm-regional-settings.dto';
import { RegionalHandoffDto } from './dto/regional-handoff.dto';
import { RegionalCaptureService } from './regional-capture.service';
import { RegionalHandoffService } from './regional-handoff.service';
import { RegionalReferenceService } from './regional-reference.service';
import { RegionalSettingsService } from './regional-settings.service';

type AuthenticatedRequest = Request & { user: IJwtPayload };

@ApiTags('Regional')
@Controller('regional')
export class RegionalController {
  constructor(
    private readonly reference: RegionalReferenceService,
    private readonly settings: RegionalSettingsService,
    private readonly capture: RegionalCaptureService,
    private readonly handoff: RegionalHandoffService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Public (pre-login) — used by the social sign-in popup flow. Validates the
   * optional hints server-side and returns ONLY an opaque, single-use token;
   * the SPA appends it to /auth/social/:provider/start. No hint data ever
   * travels in a URL. Always succeeds with a token or `{ token: null }`:
   * hints must never block sign-in.
   */
  @Post('handoff')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createHandoff(
    @Body() dto: RegionalHandoffDto,
    @Req() req: Request,
  ): Promise<{ token: string | null }> {
    // req.ip honours the single trusted proxy hop configured in main.ts.
    // Client-sent X-Forwarded-For is never read here.
    const hints = await this.capture.capture(
      dto.hints,
      resolveClientIp(req, this.config.get<string>('regional.clientIpHeader')),
    );
    if (!hints) return { token: null };

    return { token: await this.handoff.create(hints) };
  }

  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard)
  @Get('reference')
  @ApiOperation({ summary: 'Active countries and currencies' })
  async referenceData() {
    const [countries, currencies] = await Promise.all([
      this.reference.listCountries(),
      this.reference.listCurrencies(),
    ]);

    return {
      countries: countries
        .map((c) => ({
          code: c.code,
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          nativeName: c.nativeName,
          defaultCurrencyCode: c.defaultCurrencyCode,
          defaultLocale: c.defaultLocale,
          defaultTimezone: c.defaultTimezone,
        }))
        .sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
      currencies: currencies
        .map((c) => ({
          code: c.code,
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          symbol: c.symbol,
          minorUnit: c.minorUnit,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }

  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard)
  @Get('settings')
  @ApiOperation({
    summary: 'Regional settings of the caller’s company',
    description:
      'Every member can read the confirmed values (needed for formatting). The detection suggestion is only included for the Owner.',
  })
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.settings.get(req.user.companyId, req.user.isOwner === true);
  }

  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, OwnerGuard, CsrfGuard)
  @Put('settings')
  @ApiOperation({ summary: 'Owner confirms the company regional settings' })
  confirmSettings(
    @Body() dto: ConfirmRegionalSettingsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    // Deliberately NOT auditActorFromRequest(): the audit row of a regional
    // change must not carry the request IP.
    const actor: AuditActor = { actorUserId: req.user.sub };
    return this.settings.confirm(req.user.companyId, dto, actor);
  }
}
