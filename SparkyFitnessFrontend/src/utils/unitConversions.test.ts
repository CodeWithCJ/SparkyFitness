import {
  cmToFeetInches,
  formatHeight,
  formatWeight,
  kgToStonesLbs,
  stonesLbsToKg,
} from './unitConversions';

describe('kgToStonesLbs', () => {
  it.each([5, 12, 13, 14, 22, 30])('keeps %i st 0 lb whole', (stones) => {
    expect(kgToStonesLbs(stonesLbsToKg(stones, 0))).toEqual({ stones, lbs: 0 });
  });

  it('keeps a fractional pound remainder', () => {
    const { stones, lbs } = kgToStonesLbs(stonesLbsToKg(13, 3.5));
    expect(stones).toBe(13);
    expect(lbs).toBeCloseTo(3.5);
  });

  it('formats whole stones without a 14 lb remainder', () => {
    expect(formatWeight(stonesLbsToKg(12, 0), 'st_lbs')).toBe('12st 0lbs');
  });
});

describe('cmToFeetInches', () => {
  it('keeps 6 ft 0 in whole', () => {
    expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
    expect(formatHeight(182.88, 'ft_in')).toBe(`6'0"`);
  });
});
