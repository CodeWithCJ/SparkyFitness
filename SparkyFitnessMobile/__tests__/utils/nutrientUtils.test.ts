import { getNetCarbsValue } from '../../src/utils/nutrientUtils';

describe('getNetCarbsValue', () => {
  it('subtracts fiber from carbs when both are positive', () => {
    expect(getNetCarbsValue(30, 10)).toBe(20);
    expect(getNetCarbsValue(100, 25)).toBe(75);
    expect(getNetCarbsValue(5, 5)).toBe(0);
  });

  it('floors at zero when fiber exceeds carbs', () => {
    expect(getNetCarbsValue(10, 25)).toBe(0);
    expect(getNetCarbsValue(0, 10)).toBe(0);
  });

  it('treats nullish carbs as zero', () => {
    expect(getNetCarbsValue(null, 5)).toBe(0);
    expect(getNetCarbsValue(undefined, 5)).toBe(0);
  });

  it('treats nullish fiber as zero (carbs unchanged)', () => {
    expect(getNetCarbsValue(30, null)).toBe(30);
    expect(getNetCarbsValue(30, undefined)).toBe(30);
  });

  it('returns zero when both inputs are nullish', () => {
    expect(getNetCarbsValue(null, null)).toBe(0);
    expect(getNetCarbsValue(undefined, undefined)).toBe(0);
  });

  it('handles fractional inputs', () => {
    expect(getNetCarbsValue(12.5, 3.2)).toBeCloseTo(9.3, 5);
    expect(getNetCarbsValue(7.1, 7.1)).toBeCloseTo(0, 5);
  });

  it('handles NaN inputs as zero (numeric fallback)', () => {
    expect(getNetCarbsValue(Number.NaN, 5)).toBe(0);
    expect(getNetCarbsValue(30, Number.NaN)).toBe(30);
  });
});
