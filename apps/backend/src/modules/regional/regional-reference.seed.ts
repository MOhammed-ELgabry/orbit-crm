import type { PrismaClient } from '@prisma/client';

import { COUNTRY_SEED } from './data/countries.data';
import { CURRENCY_SEED } from './data/currencies.data';

export type RegionalSeedClient = Pick<PrismaClient, 'currency' | 'country'>;

/**
 * Idempotent sync of the regional reference tables from the compiled data
 * (active ISO 4217 currencies + ISO 3166-1 countries).
 *
 *  - Creates what is missing and refreshes the ISO-sourced attributes
 *    (names, symbol, minor unit, default currency/locale/timezone).
 *  - NEVER touches `isActive`: deactivating a row by hand survives re-seeding.
 *  - Never deletes anything (companies / future data may reference a row).
 *
 * Currencies are written first because Country.defaultCurrencyCode
 * references them.
 */
export async function syncRegionalReference(
  client: RegionalSeedClient,
): Promise<{ currencies: number; countries: number }> {
  for (const c of CURRENCY_SEED) {
    await client.currency.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        symbol: c.symbol,
        minorUnit: c.minorUnit,
      },
      update: {
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        symbol: c.symbol,
        minorUnit: c.minorUnit,
      },
    });
  }

  for (const c of COUNTRY_SEED) {
    const data = {
      alpha3: c.alpha3,
      numericCode: c.numeric,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      nativeName: c.nativeName,
      defaultCurrencyCode: c.defaultCurrency,
      defaultLocale: c.defaultLocale,
      defaultTimezone: c.defaultTimezone,
    };
    await client.country.upsert({
      where: { code: c.code },
      create: { code: c.code, ...data },
      update: data,
    });
  }

  return { currencies: CURRENCY_SEED.length, countries: COUNTRY_SEED.length };
}
