import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ExerciseSessionResponse } from '@workspace/shared';
import {
  computeCalorieBalance,
  extractExerciseStats,
  resolveDayFraction,
  sumFoodEntryCalories,
  type CalorieBalanceInputs,
} from '../services/calorieBalanceService.js';
import bmrService from '../services/bmrService.js';

vi.mock('../services/bmrService.js', () => ({
  default: { calculateBmr: vi.fn() },
}));

const BMR = 2000;

beforeEach(() => {
  vi.mocked(bmrService.calculateBmr).mockReturnValue(BMR);
});

const inputs = (
  overrides: Partial<CalorieBalanceInputs> = {}
): CalorieBalanceInputs => ({
  eatenCalories: 2000,
  exercise: { activeCalories: 0, otherCalories: 0, activitySteps: 0 },
  backgroundStepCalories: 0,
  adjustedGoalCalories: 1962,
  userProfile: { date_of_birth: '1990-01-01', gender: 'male' },
  userPreferences: {
    timezone: 'UTC',
    activity_level: 'not_much',
    calorie_goal_adjustment_mode: 'dynamic',
    include_bmr_in_net_calories: false,
  },
  measurements: { weight: 80, height: 180 },
  externalBmr: null,
  dayFraction: 1,
  ...overrides,
});

describe('resolveExerciseCalories via computeCalorieBalance', () => {
  /**
   * Aug 11 from issue #2094: a 641 kcal logged workout, a 774 kcal device summary, and
   * 138 kcal of background steps. The correct credit is max(774, 641 + 138) = 779.
   * The Reports page used to sum them and credit 1415.
   */
  test('takes the device summary over logged + steps, never their sum', () => {
    const balance = computeCalorieBalance(
      inputs({
        exercise: { activeCalories: 774, otherCalories: 641, activitySteps: 0 },
        backgroundStepCalories: 138,
      })
    );

    expect(balance.burned).toBe(779);
    expect(balance.burned).not.toBe(1415);
    // 774 < 641 + 138, so the logged arm wins the max here — but the point is that the
    // two arms are compared, not added.
    expect(balance.exerciseSource).toBe('logged');
  });

  /**
   * Aug 8 from issue #2094: no exercise entries at all, only steps. The Reports page
   * could not see step calories, so it credited zero.
   */
  test('credits a steps-only day', () => {
    const balance = computeCalorieBalance(
      inputs({ backgroundStepCalories: 174 })
    );

    expect(balance.burned).toBe(174);
    expect(balance.exerciseSource).toBe('steps');
  });

  test('takes the device summary when it exceeds logged + steps', () => {
    const balance = computeCalorieBalance(
      inputs({
        exercise: {
          activeCalories: 1200,
          otherCalories: 641,
          activitySteps: 0,
        },
        backgroundStepCalories: 138,
      })
    );

    expect(balance.burned).toBe(1200);
    expect(balance.burned).not.toBe(1979);
    expect(balance.exerciseSource).toBe('active');
  });

  test('a tie goes to the device summary', () => {
    const balance = computeCalorieBalance(
      inputs({
        exercise: { activeCalories: 779, otherCalories: 641, activitySteps: 0 },
        backgroundStepCalories: 138,
      })
    );

    expect(balance.burned).toBe(779);
    expect(balance.exerciseSource).toBe('active');
  });

  test('an empty day credits nothing', () => {
    const balance = computeCalorieBalance(inputs());
    expect(balance.burned).toBe(0);
    expect(balance.exerciseSource).toBe('none');
  });
});

describe('include_bmr_in_net_calories', () => {
  test('folds BMR into burned and remaining when enabled', () => {
    const withBmr = computeCalorieBalance(
      inputs({
        backgroundStepCalories: 174,
        userPreferences: {
          timezone: 'UTC',
          activity_level: 'not_much',
          calorie_goal_adjustment_mode: 'dynamic',
          include_bmr_in_net_calories: true,
        },
      })
    );

    expect(withBmr.burned).toBe(174 + BMR);
    // dynamic: remaining = goal - (eaten - burned)
    expect(withBmr.remaining).toBe(1962 - (2000 - (174 + BMR)));
  });

  test('excludes BMR when disabled', () => {
    const withoutBmr = computeCalorieBalance(
      inputs({ backgroundStepCalories: 174 })
    );
    expect(withoutBmr.burned).toBe(174);
  });
});

describe('adjustment modes', () => {
  const modes = [
    'dynamic',
    'percentage',
    'tdee',
    'smart',
    'adaptive',
    'fixed',
  ] as const;

  test.each(modes)('%s produces a coherent balance', (mode) => {
    const balance = computeCalorieBalance(
      inputs({
        exercise: { activeCalories: 0, otherCalories: 500, activitySteps: 0 },
        userPreferences: {
          timezone: 'UTC',
          activity_level: 'not_much',
          calorie_goal_adjustment_mode: mode,
          include_bmr_in_net_calories: false,
          exercise_calorie_percentage: 100,
        },
      })
    );

    // The identity the Reports chart relies on to turn `remaining` back into a goal.
    expect(balance.eaten + balance.remaining).toBeGreaterThan(0);
    expect(balance.burned).toBe(500);
  });

  test('dynamic credits the full exercise arm, fixed credits none', () => {
    const exercise = {
      activeCalories: 0,
      otherCalories: 500,
      activitySteps: 0,
    };
    const base = {
      timezone: 'UTC',
      activity_level: 'not_much',
      include_bmr_in_net_calories: false,
    };

    const dynamic = computeCalorieBalance(
      inputs({
        exercise,
        userPreferences: {
          ...base,
          calorie_goal_adjustment_mode: 'dynamic',
        },
      })
    );
    const fixed = computeCalorieBalance(
      inputs({
        exercise,
        userPreferences: { ...base, calorie_goal_adjustment_mode: 'fixed' },
      })
    );

    expect(dynamic.eaten + dynamic.remaining).toBe(1962 + 500);
    expect(fixed.eaten + fixed.remaining).toBe(1962);
  });

  test('percentage credits only the configured share', () => {
    const balance = computeCalorieBalance(
      inputs({
        exercise: { activeCalories: 0, otherCalories: 500, activitySteps: 0 },
        userPreferences: {
          timezone: 'UTC',
          activity_level: 'not_much',
          include_bmr_in_net_calories: false,
          calorie_goal_adjustment_mode: 'percentage',
          exercise_calorie_percentage: 50,
        },
      })
    );

    expect(balance.eaten + balance.remaining).toBe(1962 + 250);
  });
});

describe('dayFraction / tdee projection', () => {
  const tdeePrefs = {
    timezone: 'UTC',
    activity_level: 'not_much',
    include_bmr_in_net_calories: false,
    calorie_goal_adjustment_mode: 'tdee' as const,
    tdee_allow_negative_adjustment: true,
  };

  test('a completed day is not extrapolated', () => {
    const balance = computeCalorieBalance(
      inputs({
        exercise: { activeCalories: 0, otherCalories: 500, activitySteps: 0 },
        userPreferences: tdeePrefs,
        dayFraction: 1,
      })
    );

    expect(balance.tdeeProjection?.projectedBurn).toBe(BMR + 500);
  });

  test('a half-elapsed day projects to end of day', () => {
    const balance = computeCalorieBalance(
      inputs({
        exercise: { activeCalories: 0, otherCalories: 500, activitySteps: 0 },
        userPreferences: tdeePrefs,
        dayFraction: 0.5,
      })
    );

    expect(balance.tdeeProjection?.projectedBurn).toBe(BMR + 1000);
  });
});

describe('resolveDayFraction', () => {
  test('a past day is complete', () => {
    const now = new Date('2026-08-20T12:00:00Z');
    expect(resolveDayFraction('2026-08-19', 'UTC', now)).toBe(1);
  });

  test('today reflects the live clock', () => {
    const now = new Date('2026-08-20T12:00:00Z');
    expect(resolveDayFraction('2026-08-20', 'UTC', now)).toBeCloseTo(0.5, 5);
  });

  /**
   * At 23:00 UTC on the 20th it is already the 21st in Tokyo, so the 20th is finished
   * for that user even though UTC still calls it today.
   */
  test('completeness is judged in the user timezone', () => {
    const now = new Date('2026-08-20T23:00:00Z');
    expect(resolveDayFraction('2026-08-20', 'Asia/Tokyo', now)).toBe(1);
    expect(resolveDayFraction('2026-08-20', 'UTC', now)).toBeLessThan(1);
  });
});

describe('extractExerciseStats', () => {
  test('separates the device summary from logged workouts', () => {
    const sessions = [
      {
        type: 'individual',
        name: 'Active Calories',
        calories_burned: 774,
        steps: 0,
      },
      { type: 'individual', name: 'Run', calories_burned: 641, steps: 4000 },
    ] as unknown as ExerciseSessionResponse[];

    expect(extractExerciseStats(sessions)).toEqual({
      activeCalories: 774,
      otherCalories: 641,
      activitySteps: 4000,
    });
  });

  /**
   * A preset is a user-built workout, so its children are logged exercise regardless of
   * what any child is named. The ranged SQL mirrors this with its
   * `exercise_preset_entry_id IS NOT NULL` clause.
   */
  test('folds every preset child into the logged arm', () => {
    const sessions = [
      {
        type: 'preset',
        exercises: [
          { calories_burned: 100, steps: 500 },
          { name: 'Active Calories', calories_burned: 50, steps: 0 },
        ],
      },
    ] as unknown as ExerciseSessionResponse[];

    expect(extractExerciseStats(sessions)).toEqual({
      activeCalories: 0,
      otherCalories: 150,
      activitySteps: 500,
    });
  });
});

describe('sumFoodEntryCalories', () => {
  test('scales per-serving values by quantity', () => {
    expect(
      sumFoodEntryCalories([
        { calories: 100, quantity: 2, serving_size: 100 },
        { calories: 250, quantity: 0.5, serving_size: 100 },
      ])
    ).toBe(3.25);
  });

  test('defaults a missing serving size to 100', () => {
    expect(sumFoodEntryCalories([{ calories: 200, quantity: 1 }])).toBe(2);
  });
});

describe('external BMR override', () => {
  const externalPrefs = {
    timezone: 'UTC',
    activity_level: 'not_much',
    calorie_goal_adjustment_mode: 'dynamic' as const,
    include_bmr_in_net_calories: true,
    use_external_bmr: true,
  };

  test('prefers a synced BMR inside the sanity bounds', () => {
    const balance = computeCalorieBalance(
      inputs({ externalBmr: 1800, userPreferences: externalPrefs })
    );

    expect(balance.bmr).toBe(1800);
    expect(balance.bmrSource).toBe('external');
    expect(balance.burned).toBe(1800);
  });

  // A bad sample must not be able to zero out the day's target.
  test.each([599, 6001, 0, -50])(
    'keeps the formula BMR when the synced value %s is out of bounds',
    (value) => {
      const balance = computeCalorieBalance(
        inputs({ externalBmr: value, userPreferences: externalPrefs })
      );

      expect(balance.bmr).toBe(BMR);
      expect(balance.bmrSource).toBe('formula');
    }
  );

  test.each([600, 6000])('accepts the boundary value %s', (value) => {
    const balance = computeCalorieBalance(
      inputs({ externalBmr: value, userPreferences: externalPrefs })
    );

    expect(balance.bmr).toBe(value);
    expect(balance.bmrSource).toBe('external');
  });

  test('ignores a synced BMR when the user has not opted in', () => {
    const balance = computeCalorieBalance(
      inputs({
        externalBmr: 1800,
        userPreferences: { ...externalPrefs, use_external_bmr: false },
      })
    );

    expect(balance.bmr).toBe(BMR);
    expect(balance.bmrSource).toBe('formula');
  });
});
