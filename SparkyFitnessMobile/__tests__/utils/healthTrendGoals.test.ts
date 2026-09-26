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
  // `HydrationBarChart` expects `goal` in raw millilitres (matching `data`'s unit) and
  // converts it to the display unit itself, the same way it converts each plotted point —
  // converting here too would double-convert it.
  test('returns the millilitre water goal unchanged', () => {
    expect(resolveHydrationGoal(2500)).toBe(2500);
  });

  test('returns undefined when the water goal is zero', () => {
    expect(resolveHydrationGoal(0)).toBeUndefined();
  });

  test('returns undefined for a negative water goal', () => {
    expect(resolveHydrationGoal(-1)).toBeUndefined();
  });
});
