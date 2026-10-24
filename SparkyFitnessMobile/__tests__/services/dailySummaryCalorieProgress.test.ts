import {
  buildDailySummary,
  type DailySummaryRawData,
} from '../../src/services/dailySummaryService';

const raw: DailySummaryRawData = {
  goals: { calories: 1800, protein: 0, carbs: 0, fat: 0, dietary_fiber: 0 },
  foodEntries: [],
  exerciseEntries: [],
  waterIntake: { water_ml: 0 },
  stepCalories: 0,
  calorieBalance: {
    eaten: 1225,
    burned: 681,
    remaining: 1256,
    goal: 1800,
    net: 544,
    progress: 30,
    bmr: 1750,
    exerciseSource: 'steps',
    tdeeProjection: null,
  },
};

describe('daily summary calorie progress', () => {
  it('normalizes an older server percentage while preserving its calorie totals', () => {
    const balance = buildDailySummary('2026-10-24', raw).calorieBalance;
    expect(balance).toEqual({ ...raw.calorieBalance, progress: 49 });
    expect(raw.calorieBalance?.progress).toBe(30);
  });

  it('does not erase intake when an older server reports zero net progress', () => {
    const balance = buildDailySummary('2026-10-24', {
      ...raw,
      calorieBalance: {
        ...raw.calorieBalance!,
        eaten: 500,
        burned: 1000,
        remaining: 2300,
        net: -500,
        progress: 0,
      },
    }).calorieBalance;
    expect(balance.progress).toBe(18);
  });

  it('keeps an empty fallback without a calorie goal finite', () => {
    const balance = buildDailySummary('2026-10-24', {
      ...raw,
      goals: { ...raw.goals, calories: 0 },
      calorieBalance: undefined,
    }).calorieBalance;
    expect(balance.progress).toBe(0);
  });
});
