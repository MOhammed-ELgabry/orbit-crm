import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateDealDto } from '../../deal/dto/create-deal.dto';
import { UpdateDealDto } from '../../deal/dto/update-deal.dto';
import { normalizeMoneyInput, significantDecimalPlaces } from './money.util';

describe('normalizeMoneyInput', () => {
  it.each([
    ['0', '0'],
    ['15000', '15000'],
    [' 12.34 ', '12.34'],
    ['999999999999999.9999', '999999999999999.9999'],
    ['0.0001', '0.0001'],
    [15000, '15000'],
    [12.5, '12.5'],
    [0, '0'],
  ])('accepts %p', (input, expected) => {
    expect(normalizeMoneyInput(input)).toBe(expected);
  });

  it.each([
    '',
    '-1',
    '+1',
    '1e3',
    '1,000',
    '12.34567',
    '1.',
    '.5',
    'abc',
    '1234567890123456', // 16 integer digits
    '12 34',
    -5,
    NaN,
    Infinity,
    1e21,
    null,
    undefined,
    {},
    [],
    true,
  ])('rejects %p', (input) => {
    expect(normalizeMoneyInput(input)).toBeNull();
  });

  it('never rounds', () => {
    expect(normalizeMoneyInput('1.00005')).toBeNull();
    expect(normalizeMoneyInput(0.30000000000000004)).toBeNull();
  });
});

describe('significantDecimalPlaces', () => {
  it.each([
    ['12', 0],
    ['12.0000', 0],
    ['12.50', 1],
    ['12.345', 3],
    ['0.0001', 4],
    ['12.3400', 2],
  ])('%s -> %i', (value, places) => {
    expect(significantDecimalPlaces(value)).toBe(places);
  });
});

describe('Deal DTO amount (decimal string, never a float)', () => {
  const base = { title: 'Big deal' };

  it('keeps legacy numeric clients working (number -> decimal string)', async () => {
    const dto = plainToInstance(CreateDealDto, { ...base, amount: 15000.5 });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.amount).toBe('15000.5');
  });

  it('accepts a 4-decimal string and a 15-digit integer part', async () => {
    const dto = plainToInstance(CreateDealDto, {
      ...base,
      amount: '999999999999999.9999',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.amount).toBe('999999999999999.9999');
  });

  it('is optional on create and update', async () => {
    expect(await validate(plainToInstance(CreateDealDto, base))).toHaveLength(
      0,
    );
    expect(await validate(plainToInstance(UpdateDealDto, {}))).toHaveLength(0);
  });

  it.each(['-1', '1e3', '12.34567', 'abc', 1e21, '', {}])(
    'rejects %p',
    async (amount) => {
      const errors = await validate(
        plainToInstance(CreateDealDto, { ...base, amount }),
      );
      expect(errors.map((e) => e.property)).toContain('amount');
    },
  );
});
