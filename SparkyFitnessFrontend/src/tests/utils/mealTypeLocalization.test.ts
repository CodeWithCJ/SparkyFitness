import { getLocalizedMealTypeName } from '@/utils/mealTypeLocalization';

describe('getLocalizedMealTypeName', () => {
  const t = ((key: string) => `[${key}]`) as never;

  it.each([
    ['Breakfast', '[common.breakfast]'],
    [' lunch ', '[common.lunch]'],
    ['DINNER', '[common.dinner]'],
    ['Snack', '[common.snacks]'],
    ['snacks', '[common.snacks]'],
  ])('localizes a standard meal name %s', (mealName, expected) => {
    expect(getLocalizedMealTypeName(mealName, t)).toBe(expected);
  });

  it('preserves a user-created meal name', () => {
    expect(getLocalizedMealTypeName('بعد التمرين', t)).toBe('بعد التمرين');
  });
});
