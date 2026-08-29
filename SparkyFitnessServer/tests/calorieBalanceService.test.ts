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

  test.each([
    ['maintain', 0, 2400],
    ['manual', -10, 2160],
    ['manual', 10, 2640],
  ])(
    'uses Health Connect total burn as TDEE before applying %s (%s%%)',
    (goalMode, customPercentage, expectedTarget) => {
      const balance = computeCalorieBalance(
        inputs({
          adjustedGoalCalories: 1800,
          deviceTotalCalories: 1200,
          exercise: {
            activeCalories: 500,
            otherCalories: 0,
            activitySteps: 0,
          },
          userPreferences: {
            ...tdeePrefs,
            goal_mode: goalMode,
            goal_mode_custom_percentage: customPercentage,
          },
          dayFraction: 0.5,
        })
      );

      expect(balance.tdeeProjection).toEqual({
        projectedBurn: 2400,
        baselineBurn: 2400,
        adjustment: expectedTarget - 1800,
        targetCalories: expectedTarget,
        source: 'health_connect_total',
      });
      expect(balance.goal).toBe(expectedTarget);
      expect(balance.remaining).toBe(expectedTarget - 2000);
    }
  );

  test('uses a completed Health Connect day without extrapolating it', () => {
    const balance = computeCalorieBalance(
      inputs({
        adjustedGoalCalories: 2000,
        deviceTotalCalories: 2300,
        userPreferences: {
          ...tdeePrefs,
          goal_mode: 'maintain',
        },
        dayFraction: 1,
      })
    );

    expect(balance.tdeeProjection?.projectedBurn).toBe(2300);
    expect(balance.tdeeProjection?.targetCalories).toBe(2300);
    expect(balance.goal).toBe(2300);
  });

  test('projects from the device sample time instead of the later view time', () => {
    const balance = computeCalorieBalance({
      ...inputs({
        adjustedGoalCalories: 2000,
        deviceTotalCalories: 1200,
        userPreferences: {
          ...tdeePrefs,
          goal_mode: 'maintain',
        },
        dayFraction: 0.8,
      }),
      deviceTotalDayFraction: 0.5,
    } as CalorieBalanceInputs & { deviceTotalDayFraction: number });

    expect(balance.tdeeProjection?.projectedBurn).toBe(2400);
    expect(balance.tdeeProjection?.source).toBe('health_connect_total');
  });

  test('preserves the configured adaptive safety floor', () => {
    const balance = computeCalorieBalance(
      inputs({
        adjustedGoalCalories: 2000,
        deviceTotalCalories: 950,
        userPreferences: {
          ...tdeePrefs,
          goal_mode: 'high_cut',
          goal_mode_calculation_method: 'adaptive',
          calorie_safety_floor_mode: 'standard',
        },
        dayFraction: 0.5,
      })
    );

    // 1900 - 20% = 1520, but the male RMR/clinical floor is 2000 here.
    expect(balance.tdeeProjection?.targetCalories).toBe(BMR);
    expect(balance.goal).toBe(BMR);
  });

  test.each([
    ['an implausibly low completed total', 500, 1],
    ['an excessive projected total', 15_000, 0.5],
  ])(
    'falls back when Health Connect reports %s',
    (_reason, total, fraction) => {
      const balance = computeCalorieBalance(
        inputs({
          adjustedGoalCalories: 1800,
          deviceTotalCalories: total,
          userPreferences: {
            ...tdeePrefs,
            goal_mode: 'maintain',
          },
          dayFraction: fraction,
        })
      );

      expect(balance.tdeeProjection?.source).toBe('active_plus_bmr');
    }
  );

  test.each([
    ['the day is too young', 100, 500, 0.04],
    ['total burn is below active burn', 400, 500, 0.5],
  ])(
    'falls back to BMR plus active calories when %s',
    (_reason, deviceTotalCalories, activeCalories, dayFraction) => {
      const balance = computeCalorieBalance(
        inputs({
          adjustedGoalCalories: 1800,
          deviceTotalCalories,
          exercise: {
            activeCalories,
            otherCalories: 0,
            activitySteps: 0,
          },
          userPreferences: {
            ...tdeePrefs,
            goal_mode: 'maintain',
          },
          dayFraction,
        })
      );

      expect(balance.tdeeProjection?.source).toBe('active_plus_bmr');
    }
  );
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

describe('measured BMR override', () => {
  const prefs = {
    timezone: 'UTC',
    activity_level: 'not_much',
    calorie_goal_adjustment_mode: 'dynamic' as const,
    include_bmr_in_net_calories: true,
  };

  test('prefers a check-in measured BMR over the formula calculation', () => {
    const balance = computeCalorieBalance(
      inputs({
        measurements: { weight: 80, height: 180, bmr: 1850 },
        userPreferences: prefs,
      })
    );

    expect(balance.bmr).toBe(1850);
    expect(balance.bmrSource).toBe('measured');
    expect(balance.burned).toBe(1850);
  });

  // A bad sample must not be able to zero out the day's target.
  test.each([299, 10001, 0, -50])(
    'keeps the formula BMR when the check-in value %s is out of bounds',
    (value) => {
      const balance = computeCalorieBalance(
        inputs({
          measurements: { weight: 80, height: 180, bmr: value },
          userPreferences: prefs,
        })
      );

      expect(balance.bmr).toBe(BMR);
      expect(balance.bmrSource).toBe('formula');
    }
  );

  test.each([300, 10000])('accepts the boundary value %s', (value) => {
    const balance = computeCalorieBalance(
      inputs({
        measurements: { weight: 80, height: 180, bmr: value },
        userPreferences: prefs,
      })
    );

    expect(balance.bmr).toBe(value);
    expect(balance.bmrSource).toBe('measured');
  });

  test('falls back to formula BMR when check-in BMR is absent', () => {
    const balance = computeCalorieBalance(
      inputs({
        measurements: { weight: 80, height: 180, bmr: null },
        userPreferences: prefs,
      })
    );

    expect(balance.bmr).toBe(BMR);
    expect(balance.bmrSource).toBe('formula');
  });
});
