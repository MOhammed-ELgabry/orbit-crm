import { BadRequestException } from '@nestjs/common';

import { assertValidPeriod, parseCalendarDay } from './report-period.util';

describe('parseCalendarDay', () => {
  it('accepts real calendar days, including a leap day', () => {
    expect(() => parseCalendarDay('2026-10-10', 'from')).not.toThrow();
    expect(() => parseCalendarDay('2028-02-29', 'from')).not.toThrow();
  });

  it.each([
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
  ])('rejects the impossible date %s instead of rolling it over', (value) => {
    expect(() => parseCalendarDay(value, 'from')).toThrow(BadRequestException);
  });

  it.each(['', '2026-1-1', '20261010', '2026-10-10T00:00:00Z', 'yesterday'])(
    'rejects the non-YYYY-MM-DD value %j',
    (value) => {
      expect(() => parseCalendarDay(value, 'to')).toThrow(BadRequestException);
    },
  );
});

describe('assertValidPeriod', () => {
  it('accepts a single day and an ordinary range', () => {
    expect(() => assertValidPeriod('2026-10-10', '2026-10-10')).not.toThrow();
    expect(() => assertValidPeriod('2026-10-01', '2026-10-31')).not.toThrow();
  });

  it('rejects from after to', () => {
    expect(() => assertValidPeriod('2026-10-11', '2026-10-10')).toThrow(
      BadRequestException,
    );
  });

  it('allows exactly 366 days and rejects 367', () => {
    // 2027-01-01 .. 2027-12-31 is 365 days; 2028 is a leap year (366).
    expect(() => assertValidPeriod('2028-01-01', '2028-12-31')).not.toThrow();
    expect(() => assertValidPeriod('2028-01-01', '2029-01-01')).toThrow(
      BadRequestException,
    );
  });

  it('is not fooled by a daylight-saving boundary inside the range', () => {
    // Day counting is calendar-based, not 24h-multiple-based.
    expect(() => assertValidPeriod('2026-03-01', '2026-04-30')).not.toThrow();
  });
});
