import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

describe('getLocalizedUnitLabel', () => {
  const t = ((key: string) => `[${key}]`) as never;

  it.each([
    ['g', '[units.gram]'],
    ['mg', '[units.milligram]'],
    ['µg', '[units.microgram]'],
    ['mcg', '[units.microgram]'],
    ['kcal', '[units.kcal]'],
    ['oz', '[units.ounce]'],
    ['fl oz', '[units.fluidOunce]'],
    ['serving', '[units.serving]'],
    ['tbsp', '[units.tablespoon]'],
    ['piece', '[units.piece]'],
    ['slice', '[units.slice]'],
    ['scoop', '[units.scoop]'],
  ])('localizes the standard unit %s', (unit, expected) => {
    expect(getLocalizedUnitLabel(unit, t)).toBe(expected);
  });

  it('preserves a custom unit', () => {
    expect(getLocalizedUnitLabel('مكيال', t)).toBe('مكيال');
  });
});
