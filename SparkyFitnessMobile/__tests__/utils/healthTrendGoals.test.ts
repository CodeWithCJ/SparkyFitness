import {
  resolveHydrationGoal,
  resolveWeightGoal,
} from '../../src/utils/healthTrendGoals';

describe('resolveWeightGoal', () => {
  test('converts a numeric-string target weight into the display unit', () => {
    expect(resolveWeightGoal('75.00', 'lbs')).toBeCloseTo(165.3467, 3);
  });

  test('leaves a kg target weight unconverted for a kg display unit', () => {
    expect(resolveWeightGoal(75, 'kg')).toBe(75);
  });

  test('returns undefined when there is no target weight', () => {
    expect(resolveWeightGoal(null, 'kg')).toBeUndefined();
    expect(resolveWeightGoal(undefined, 'kg')).toBeUndefined();
  });

  test('returns undefined for a non-positive or non-numeric target weight', () => {
    expect(resolveWeightGoal('0', 'kg')).toBeUndefined();
    expect(resolveWeightGoal('not-a-number', 'kg')).toBeUndefined();
  });
});

describe('resolveHydrationGoal', () => {
  test('converts a millilitre water goal into the display unit', () => {
    expect(resolveHydrationGoal(2500, 'oz')).toBeCloseTo(84.5351, 3);
  });

  test('leaves a millilitre water goal unconverted for the ml display unit', () => {
    expect(resolveHydrationGoal(2500, 'ml')).toBe(2500);
  });

  test('returns undefined when the water goal is zero', () => {
    expect(resolveHydrationGoal(0, 'ml')).toBeUndefined();
  });
});
