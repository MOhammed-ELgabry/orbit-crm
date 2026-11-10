import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { RegionalSettingsService } from './regional-settings.service';

const countries: Record<string, { code: string; defaultCurrencyCode: string }> =
  {
    EG: { code: 'EG', defaultCurrencyCode: 'EGP' },
    KW: { code: 'KW', defaultCurrencyCode: 'KWD' },
  };
const currencies: Record<string, { code: string; minorUnit: number }> = {
  EGP: { code: 'EGP', minorUnit: 2 },
  KWD: { code: 'KWD', minorUnit: 3 },
  USD: { code: 'USD', minorUnit: 2 },
};

const valid = {
  countryCode: 'EG',
  baseCurrencyCode: 'EGP',
  timezone: 'Africa/Cairo',
  defaultLocale: 'ar-EG',
};

function build(company: Record<string, unknown> | null, dealCount = 0) {
  const row = company && { deletedAt: null, ...company };
  const tx = {
    company: {
      findFirst: jest.fn().mockResolvedValue(row),
      update: jest.fn((args: { data: object }) =>
        Promise.resolve({ ...row, ...args.data }),
      ),
    },
    deal: { count: jest.fn().mockResolvedValue(dealCount) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    company: { findFirst: jest.fn().mockResolvedValue(row) },
    $transaction: jest.fn((cb: (t: unknown) => unknown) =>
      Promise.resolve(cb(tx)),
    ),
  };
  const reference = {
    getCountry: jest.fn((c: string) => Promise.resolve(countries[c] ?? null)),
    getCurrency: jest.fn((c: string) => Promise.resolve(currencies[c] ?? null)),
  };
  return {
    service: new RegionalSettingsService(prisma as never, reference as never),
    tx,
    prisma,
  };
}

describe('RegionalSettingsService.get', () => {
  const company = {
    id: 'c1',
    countryCode: null,
    baseCurrencyCode: null,
    timezone: null,
    defaultLocale: null,
    regionalStatus: 'NEEDS_REVIEW',
    suggestedCountryCode: 'KW',
    suggestedTimezone: 'Asia/Kuwait',
    suggestedLocale: 'ar-KW',
    regionalSource: 'IP',
    regionalConfidence: 'LOW',
    regionalDetectedAt: new Date('2026-11-09T00:00:00Z'),
    regionalConfirmedAt: null,
  };

  it('Owner sees the detection suggestion (with the country default currency)', async () => {
    const { service } = build(company);
    const view = await service.get('c1', true);
    expect(view.status).toBe('NEEDS_REVIEW');
    expect(view.countryCode).toBeNull(); // nothing confirmed on its own
    expect(view.suggestion).toMatchObject({
      countryCode: 'KW',
      currencyCode: 'KWD',
      source: 'IP',
      confidence: 'LOW',
    });
  });

  it('non-owner members never receive the suggestion', async () => {
    const { service } = build(company);
    expect((await service.get('c1', false)).suggestion).toBeNull();
  });

  it('legacy company: everything null, status null', async () => {
    const { service } = build({
      id: 'c1',
      countryCode: null,
      baseCurrencyCode: null,
      timezone: null,
      defaultLocale: null,
      regionalStatus: null,
      suggestedCountryCode: null,
      suggestedTimezone: null,
      suggestedLocale: null,
      regionalSource: null,
      regionalConfidence: null,
      regionalDetectedAt: null,
      regionalConfirmedAt: null,
    });
    const view = await service.get('c1', true);
    expect(view).toMatchObject({
      countryCode: null,
      baseCurrencyCode: null,
      timezone: null,
      defaultLocale: null,
      status: null,
    });
  });

  it('404 for a missing company', async () => {
    const { service } = build(null);
    await expect(service.get('nope', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('RegionalSettingsService.confirm', () => {
  const audit = { actorUserId: 'u1' };

  it('confirms: writes the four values + CONFIRMED + time, and audits without request metadata', async () => {
    const { service, tx } = build({ id: 'c1', baseCurrencyCode: null });
    await service.confirm('c1', valid, audit);

    const update = tx.company.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(update.where).toEqual({ id: 'c1' });
    expect(update.data).toMatchObject({
      countryCode: 'EG',
      baseCurrencyCode: 'EGP',
      timezone: 'Africa/Cairo',
      defaultLocale: 'ar-EG',
      regionalStatus: 'CONFIRMED',
    });
    expect(update.data.regionalConfirmedAt).toBeInstanceOf(Date);
    // detection columns are untouched by the Owner's decision
    expect(update.data).not.toHaveProperty('suggestedCountryCode');
  });

  it.each([
    ['unknown country', { countryCode: 'ZZ' }],
    ['unknown / historical currency', { baseCurrencyCode: 'HRK' }],
    ['UTC offset instead of an IANA zone', { timezone: '+02:00' }],
    ['made-up zone', { timezone: 'Mars/Base' }],
    ['bad locale', { defaultLocale: 'not a locale!!' }],
  ])('rejects %s', async (_label, patch) => {
    const { service, tx } = build({ id: 'c1' });
    await expect(
      service.confirm('c1', { ...valid, ...patch }, audit),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.company.update).not.toHaveBeenCalled();
  });

  it('changing an existing base currency with deals needs an explicit acknowledgement', async () => {
    const { service, tx } = build({ id: 'c1', baseCurrencyCode: 'EGP' }, 3);
    await expect(
      service.confirm('c1', { ...valid, baseCurrencyCode: 'USD' }, audit),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.company.update).not.toHaveBeenCalled();

    await service.confirm(
      'c1',
      { ...valid, baseCurrencyCode: 'USD', acknowledgeCurrencyChange: true },
      audit,
    );
    expect(tx.company.update).toHaveBeenCalledTimes(1);
  });

  it('changing the currency of a company with no deals needs no acknowledgement', async () => {
    const { service } = build({ id: 'c1', baseCurrencyCode: 'EGP' }, 0);
    await expect(
      service.confirm('c1', { ...valid, baseCurrencyCode: 'USD' }, audit),
    ).resolves.toBeDefined();
  });

  it('re-confirming the same currency never needs acknowledgement', async () => {
    const { service, tx } = build({ id: 'c1', baseCurrencyCode: 'EGP' }, 9);
    await service.confirm('c1', valid, audit);
    expect(tx.deal.count).not.toHaveBeenCalled();
  });
});
