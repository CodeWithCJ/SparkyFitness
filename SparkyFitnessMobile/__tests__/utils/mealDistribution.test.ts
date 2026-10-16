import {
  clampPercent,
  distributeRemaining,
  sumPercentages,
} from '../../src/utils/mealDistribution';

describe('mealDistribution', () => {
  const keys = ['breakfast', 'lunch', 'dinner', 'snacks'];

  it('clamps to whole numbers between 0 and 100', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(33.6)).toBe(34);
    expect(clampPercent(NaN)).toBe(0);
  });

  it('splits the full budget evenly when nothing is locked', () => {
    const next = distributeRemaining(
      { breakfast: 70, lunch: 10, dinner: 10, snacks: 10 },
      keys,
      {}
    );
    expect(next).toEqual({ breakfast: 25, lunch: 25, dinner: 25, snacks: 25 });
  });

  it('keeps locked meals and shares the rest, remainder spread by one point', () => {
    const next = distributeRemaining(
      { breakfast: 30, lunch: 0, dinner: 0, snacks: 0 },
      keys,
      { breakfast: true }
    );
    expect(next.breakfast).toBe(30);
    expect(sumPercentages(next, keys)).toBe(100);
    expect([next.lunch, next.dinner, next.snacks].sort()).toEqual([23, 23, 24]);
  });

  it('gives unlocked meals 0 when locked meals already use the budget', () => {
    const next = distributeRemaining(
      { breakfast: 60, lunch: 60, dinner: 10, snacks: 10 },
      keys,
      { breakfast: true, lunch: true }
    );
    expect(next.dinner).toBe(0);
    expect(next.snacks).toBe(0);
  });

  it('returns the input when every meal is locked', () => {
    const values = { breakfast: 10, lunch: 10, dinner: 10, snacks: 10 };
    expect(
      distributeRemaining(values, keys, {
        breakfast: true,
        lunch: true,
        dinner: true,
        snacks: true,
      })
    ).toBe(values);
  });
});
