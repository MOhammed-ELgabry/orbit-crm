import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PrismaExceptionMapper } from '../../common/exceptions/prisma-exception.mapper';
import { auditUpdate } from '../audit/audit.writer';
import type { AuditActor } from '../audit/audit.types';

import type {
  RegionalConfidence,
  RegionalSource,
  RegionalStatus,
} from './regional.constants';
import type { ConfirmRegionalSettingsDto } from './dto/confirm-regional-settings.dto';
import { RegionalReferenceService } from './regional-reference.service';
import {
  canonicalizeLocale,
  isValidIanaTimezone,
} from './regional-timezone.util';

export interface RegionalSettingsView {
  /** Owner-confirmed values (null on legacy / not yet confirmed companies). */
  countryCode: string | null;
  baseCurrencyCode: string | null;
  timezone: string | null;
  defaultLocale: string | null;
  /** null = legacy company, nothing detected and nothing confirmed. */
  status: RegionalStatus | null;
  confirmedAt: string | null;
  /** Only returned to the Owner. Detection result, never an authority. */
  suggestion: {
    countryCode: string | null;
    currencyCode: string | null;
    timezone: string | null;
    locale: string | null;
    source: RegionalSource | null;
    confidence: RegionalConfidence | null;
    detectedAt: string | null;
  } | null;
}

@Injectable()
export class RegionalSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reference: RegionalReferenceService,
  ) {}

  async get(
    companyId: string,
    isOwner: boolean,
  ): Promise<RegionalSettingsView> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!company) throw new NotFoundException('Company not found');

    let suggestion: RegionalSettingsView['suggestion'] = null;
    if (isOwner) {
      const suggested = await this.reference.getCountry(
        company.suggestedCountryCode,
      );
      suggestion = {
        countryCode: company.suggestedCountryCode,
        currencyCode: suggested?.defaultCurrencyCode ?? null,
        timezone: company.suggestedTimezone,
        locale: company.suggestedLocale,
        source: company.regionalSource as RegionalSource | null,
        confidence: company.regionalConfidence as RegionalConfidence | null,
        detectedAt: company.regionalDetectedAt?.toISOString() ?? null,
      };
    }

    return {
      countryCode: company.countryCode,
      baseCurrencyCode: company.baseCurrencyCode,
      timezone: company.timezone,
      defaultLocale: company.defaultLocale,
      status: company.regionalStatus as RegionalStatus | null,
      confirmedAt: company.regionalConfirmedAt?.toISOString() ?? null,
      suggestion,
    };
  }

  /** Owner confirms (or later changes) the company's regional settings. */
  async confirm(
    companyId: string,
    dto: ConfirmRegionalSettingsDto,
    audit: AuditActor,
  ): Promise<RegionalSettingsView> {
    const country = await this.reference.getCountry(dto.countryCode);
    if (!country) throw new BadRequestException('Unknown or inactive country.');

    const currency = await this.reference.getCurrency(dto.baseCurrencyCode);
    if (!currency) {
      throw new BadRequestException('Unknown or inactive currency.');
    }

    if (!isValidIanaTimezone(dto.timezone)) {
      throw new BadRequestException(
        'timezone must be an IANA timezone such as Africa/Cairo (offsets are not accepted).',
      );
    }

    const locale = canonicalizeLocale(dto.defaultLocale);
    if (!locale) {
      throw new BadRequestException(
        'defaultLocale must be a valid language tag.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const before = await tx.company.findFirst({
          where: { id: companyId, deletedAt: null },
        });
        if (!before) throw new NotFoundException('Company not found');

        // Changing the base currency never converts anything. When deals
        // already exist the Owner must say they understand that.
        if (
          before.baseCurrencyCode &&
          before.baseCurrencyCode !== currency.code &&
          dto.acknowledgeCurrencyChange !== true
        ) {
          const deals = await tx.deal.count({ where: { companyId } });
          if (deals > 0) {
            throw new ConflictException(
              'Changing the base currency does not convert existing deal amounts. Send acknowledgeCurrencyChange=true to confirm.',
            );
          }
        }

        const after = await tx.company.update({
          where: { id: companyId },
          data: {
            countryCode: country.code,
            baseCurrencyCode: currency.code,
            timezone: dto.timezone,
            defaultLocale: locale,
            regionalStatus: 'CONFIRMED',
            regionalConfirmedAt: new Date(),
          },
        });

        // The audit row records the old/new codes only. The actor carries no
        // request metadata (no IP) and detection data is never audited.
        await auditUpdate(tx, 'company', companyId, audit, before, after);
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }

    return this.get(companyId, true);
  }
}
