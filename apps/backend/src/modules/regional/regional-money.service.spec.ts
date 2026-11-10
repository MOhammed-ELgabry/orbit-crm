import { BadRequestException } from '@nestjs/common';

import { RegionalMoneyService } from './regional-money.service';

const build = (baseCurrencyCode: string | null, minorUnit?: number) => {
  const prisma = {
    company: {
      findUnique: jest.fn().mockResolvedValue({ baseCurrencyCode }),
    },
  };
  const reference = {
    getCurrency: jest
      .fn()
      .mockResolvedValue(minorUnit === undefined ? null : { minorUnit }),
  };
  return new RegionalMoneyService(prisma as never, reference as never);
};

describe('RegionalMoneyService.assertAmountAllowed', () => {
  it('does nothing when no amount is sent (update without amount)', async () => {
    await expect(
      build(null).assertAmountAllowed('c1', undefined),
    ).resolves.toBeUndefined();
  });

  it('keeps the legacy 2-decimal rule while the company has no base currency', async () => {
    const svc = build(null);
    await expect(
      svc.assertAmountAllowed('c1', '12.34'),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertAmountAllowed('c1', '12.345'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows 3 decimals for a 3-decimal currency (KWD)', async () => {
    const svc = build('KWD', 3);
    await expect(
      svc.assertAmountAllowed('c1', '12.345'),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertAmountAllowed('c1', '12.3456'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows no fraction for a 0-decimal currency (JPY) but accepts trailing zeros', async () => {
    const svc = build('JPY', 0);
    await expect(
      svc.assertAmountAllowed('c1', '1500'),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertAmountAllowed('c1', '1500.0000'),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertAmountAllowed('c1', '1500.5'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falls back to 2 decimals when the stored currency is no longer active', async () => {
    const svc = build('XXX', undefined);
    await expect(svc.assertAmountAllowed('c1', '1.234')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects malformed amounts instead of rounding them', async () => {
    await expect(
      build(null).assertAmountAllowed('c1', '1e3'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
