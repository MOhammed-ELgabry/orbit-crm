import { percentString } from './report-math.util';

describe('percentString', () => {
  it('returns null (not "0.00") when the denominator is 0 — nothing to divide by', () => {
    expect(percentString(0, 0)).toBeNull();
    expect(percentString(5, 0)).toBeNull();
  });

  it('formats exact and rounded percentages to 2 places', () => {
    expect(percentString(1, 3)).toBe('33.33');
    expect(percentString(2, 3)).toBe('66.67');
    expect(percentString(1, 2)).toBe('50.00');
    expect(percentString(0, 7)).toBe('0.00');
    expect(percentString(7, 7)).toBe('100.00');
  });

  it('rounds half up on the third decimal', () => {
    // 1/8 = 12.5 exactly; 1/16 = 6.25; 1/32 = 3.125 -> 3.13 (half up)
    expect(percentString(1, 8)).toBe('12.50');
    expect(percentString(1, 16)).toBe('6.25');
    expect(percentString(1, 32)).toBe('3.13');
  });

  it('keeps leading zeros in the fraction', () => {
    expect(percentString(1, 100)).toBe('1.00');
    expect(percentString(1, 1000)).toBe('0.10');
    expect(percentString(1, 10000)).toBe('0.01');
  });
});
