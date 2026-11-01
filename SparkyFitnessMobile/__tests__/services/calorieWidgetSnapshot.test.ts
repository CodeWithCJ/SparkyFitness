import { buildCalorieWidgetSnapshot } from '../../src/services/calorieWidgetSnapshot';
import type { DailySummary } from '../../src/types/dailySummary';

const summaryWith = (
  calorieBalance: Partial<DailySummary['calorieBalance']> | undefined
): DailySummary =>
  ({
    date: '2026-10-27',
    caloriesConsumed: 1400,
    caloriesBurned: 900,
    calorieBalance: calorieBalance as DailySummary['calorieBalance'],
  }) as DailySummary;

describe('buildCalorieWidgetSnapshot', () => {
  it('takes every figure from the calorie balance the Dashboard shows', () => {
    // Exercise credit mode: the base goal is 2000 and 300 kcal burned are
    // added back, so 800 are left. The flat caloriesConsumed/Burned fields
    // disagree with the balance and must not be used.
    expect(
      buildCalorieWidgetSnapshot(
        summaryWith({
          eaten: 1500,
          burned: 300,
          goal: 2000,
          remaining: 800,
          progress: 65.2,
        })
      )
    ).toEqual({
      date: '2026-10-27',
      food: 1500,
      burned: 300,
      goal: 2000,
      remaining: 800,
      progress: 0.652,
    });
  });

  it('has no progress without a goal', () => {
    expect(
      buildCalorieWidgetSnapshot(
        summaryWith({
          eaten: 900,
          burned: 0,
          goal: 0,
          remaining: -900,
          progress: 40,
        })
      )
    ).toMatchObject({ goal: 0, progress: 0, food: 900 });
  });

  it('caps the progress at a full bar', () => {
    expect(
      buildCalorieWidgetSnapshot(
        summaryWith({
          eaten: 2600,
          burned: 0,
          goal: 2000,
          remaining: -600,
          progress: 130,
        })
      )
    ).toMatchObject({ progress: 1 });
  });

  it('builds nothing without a calorie balance', () => {
    expect(buildCalorieWidgetSnapshot(summaryWith(undefined))).toBeUndefined();
  });
});
