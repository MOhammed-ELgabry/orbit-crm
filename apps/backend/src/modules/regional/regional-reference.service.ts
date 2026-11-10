import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

import { REGIONAL_REFERENCE_CACHE_MS } from './regional.constants';
import { COUNTRY_SEED } from './data/countries.data';
import { CURRENCY_SEED } from './data/currencies.data';

export interface CountryRef {
  code: string;
  alpha3: string;
  nameEn: string;
  nameAr: string;
  nativeName: string;
  defaultCurrencyCode: string | null;
  defaultLocale: string | null;
  defaultTimezone: string | null;
}

export interface CurrencyRef {
  code: string;
  nameEn: string;
  nameAr: string;
  symbol: string;
  minorUnit: number;
}

interface Snapshot {
  countries: Map<string, CountryRef>;
  currencies: Map<string, CurrencyRef>;
  loadedAt: number;
}

/**
 * Read access to the reference tables (Country / Currency) with a short
 * in-process cache. The database is the source of truth (rows can be updated
 * later without a deploy); the compiled seed data is only a fallback for a
 * database that has not been seeded yet, so validation never silently turns
 * off.
 */
@Injectable()
export class RegionalReferenceService {
  private readonly logger = new Logger(RegionalReferenceService.name);
  private snapshot: Snapshot | null = null;
  private loading: Promise<Snapshot> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Test/seed hook: forget the cached snapshot. */
  invalidate(): void {
    this.snapshot = null;
  }

  async listCountries(): Promise<CountryRef[]> {
    return [...(await this.load()).countries.values()];
  }

  async listCurrencies(): Promise<CurrencyRef[]> {
    return [...(await this.load()).currencies.values()];
  }

  async getCountry(code: unknown): Promise<CountryRef | null> {
    if (typeof code !== 'string') return null;
    return (await this.load()).countries.get(code.toUpperCase()) ?? null;
  }

  async getCurrency(code: unknown): Promise<CurrencyRef | null> {
    if (typeof code !== 'string') return null;
    return (await this.load()).currencies.get(code.toUpperCase()) ?? null;
  }

  private async load(): Promise<Snapshot> {
    const now = Date.now();
    if (
      this.snapshot &&
      now - this.snapshot.loadedAt < REGIONAL_REFERENCE_CACHE_MS
    ) {
      return this.snapshot;
    }

    if (!this.loading) {
      this.loading = this.fetch().finally(() => {
        this.loading = null;
      });
    }

    this.snapshot = await this.loading;
    return this.snapshot;
  }

  private async fetch(): Promise<Snapshot> {
    try {
      const [countries, currencies] = await Promise.all([
        this.prisma.country.findMany({ where: { isActive: true } }),
        this.prisma.currency.findMany({ where: { isActive: true } }),
      ]);

      if (countries.length > 0 && currencies.length > 0) {
        return {
          countries: new Map(countries.map((c) => [c.code, c])),
          currencies: new Map(currencies.map((c) => [c.code, c])),
          loadedAt: Date.now(),
        };
      }

      this.logger.warn(
        'Regional reference tables are empty; using compiled seed data. Run the seed.',
      );
    } catch (error) {
      this.logger.warn(
        `Regional reference lookup failed; using compiled seed data (${(error as Error).message}).`,
      );
    }

    return {
      countries: new Map(
        COUNTRY_SEED.map((c) => [
          c.code,
          {
            code: c.code,
            alpha3: c.alpha3,
            nameEn: c.nameEn,
            nameAr: c.nameAr,
            nativeName: c.nativeName,
            defaultCurrencyCode: c.defaultCurrency,
            defaultLocale: c.defaultLocale,
            defaultTimezone: c.defaultTimezone,
          },
        ]),
      ),
      currencies: new Map(CURRENCY_SEED.map((c) => [c.code, { ...c }])),
      loadedAt: Date.now(),
    };
  }
}
