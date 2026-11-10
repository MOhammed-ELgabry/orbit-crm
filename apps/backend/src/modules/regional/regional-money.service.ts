import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

import {
  significantDecimalPlaces,
  normalizeMoneyInput,
} from './money/money.util';
import { RegionalReferenceService } from './regional-reference.service';

/** Decimal places allowed while the company has no base currency (legacy rule). */
export const LEGACY_AMOUNT_DECIMALS = 2;

/**
 * Cross-checks an amount against the company's base currency. Storage is a
 * unified Decimal(19,4); the currency's ISO 4217 minor unit decides how many
 * decimals are meaningful (JPY 0, EGP/USD 2, KWD/BHD 3). Nothing is ever
 * rounded: an amount with too many decimals is rejected so no value is
 * silently changed. A company that has not chosen a base currency keeps the
 * legacy limit of 2 decimals.
 */
@Injectable()
export class RegionalMoneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reference: RegionalReferenceService,
  ) {}

  async allowedDecimals(companyId: string): Promise<{
    code: string | null;
    decimals: number;
  }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { baseCurrencyCode: true },
    });

    const code = company?.baseCurrencyCode ?? null;
    if (!code) return { code: null, decimals: LEGACY_AMOUNT_DECIMALS };

    const currency = await this.reference.getCurrency(code);
    return { code, decimals: currency?.minorUnit ?? LEGACY_AMOUNT_DECIMALS };
  }

  async assertAmountAllowed(
    companyId: string,
    amount: string | number | undefined,
  ): Promise<void> {
    if (amount === undefined) return;

    const normalized = normalizeMoneyInput(amount);
    if (normalized === null) {
      throw new BadRequestException('Invalid amount.');
    }

    const { code, decimals } = await this.allowedDecimals(companyId);
    if (significantDecimalPlaces(normalized) > decimals) {
      throw new BadRequestException(
        `Amount allows at most ${decimals} decimal place${decimals === 1 ? '' : 's'}${code ? ` for ${code}` : ''}.`,
      );
    }
  }
}
