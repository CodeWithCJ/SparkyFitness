import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ExerciseSessionResponse } from '@workspace/shared';
import {
  computeCalorieBalance,
  extractExerciseStats,
  resolveDeviceProjectionSnapshot,
  resolveDayFraction,
  sumFoodEntryCalories,
  type CalorieBalanceInputs,
} from '../services/calorieBalanceService.js';
import bmrService from '../services/bmrService.js';

vi.mock('../services/bmrService.js', () => ({
  default: { calculateBmr: vi.fn() },
}));

const BMR = 2000;

describe('weekly goal on device projection', () => {
  test('applies the configured floor to a weekly goal with a manual calculation baseline', () => {
    const balance = computeCalorieBalance(
      inputs({
        adjustedGoalCalories: 2200,
        deviceTotalCalories: 2200,
        deviceTotalDayFraction: 1,
        userPreferences: {
          calorie_goal_adjustment_mode: 'tdee',
          goal_mode: 'weekly',
          goal_mode_calculation_method: 'manual',
          goal_mode_weekly_change_kg: -2,
          calorie_safety_floor_mode: 'custom',
          calorie_safety_floor_value: 1500,
        },
      })
    );
    expect(balance.goal).toBe(1500);
  });

  test.each([-0.5, 0, 0.25])(
    'applies %s kg/week once to device TDEE',
    (rate) => {
      const balance = computeCalorieBalance(
        inputs({
          adjustedGoalCalories: 2200,
          eatenCalories: 1000,
          deviceTotalCalories: 3000,
          deviceTotalDayFraction: 1,
          userPreferences: {
            calorie_goal_adjustment_mode: 'tdee',
            goal_mode: 'weekly',
            goal_mode_weekly_change_kg: rate,
          },
        })
      );
      const expectedTarget = Math.round(3000 + (rate * 6000) / 7);
      expect(balance.goal).toBe(expectedTarget);
      expect(balance.remaining).toBe(expectedTarget - 1000);
    }
  );
});

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

describe('food budget progress', () => {
  test.each([
    ['dynamic', 100, 1256, 49],
    ['percentage', 50, 915.5, 57],
    ['fixed', 100, 575, 68],
    ['adaptive', 100, 575, 68],
  ] as const)(
    '%s credits only the configured activity in progress',
    (mode, percentage, remaining, progress) => {
      const balance = computeCalorieBalance(
        inputs({
          adjustedGoalCalories: 1800,
          eatenCalories: 1225,
          backgroundStepCalories: 681,
          userPreferences: {
            calorie_goal_adjustment_mode: mode,
            exercise_calorie_percentage: percentage,
          },
        })
      );

      expect(balance.eaten).toBe(1225);
      expect(balance.burned).toBe(681);
      expect(balance.remaining).toBe(Math.round(remaining));
      expect(balance.goal).toBe(1800);
      expect(balance.progress).toBe(progress);
    }
  );

  test('activity cannot erase food progress when burn exceeds intake', () => {
    const balance = computeCalorieBalance(
      inputs({
        adjustedGoalCalories: 1800,
        eatenCalories: 500,
        backgroundStepCalories: 1000,
      })
    );
    expect(balance.remaining).toBe(2300);
    expect(balance.progress).toBe(18);
  });

  test('preserves overflow after the activity-adjusted budget is exceeded', () => {
    const balance = computeCalorieBalance(
      inputs({
        adjustedGoalCalories: 1800,
        eatenCalories: 3000,
        backgroundStepCalories: 600,
      })
    );
    expect(balance.remaining).toBe(-600);
    expect(balance.progress).toBe(125);
  });
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

describe('adaptive calculation with activity earn-back', () => {
  test.each(['dynamic', 'percentage'] as const)(
    '%s does not add activity or BMR to a target based on full-day TDEE',
    (mode) => {
      const balance = computeCalorieBalance(
        inputs({
          adjustedGoalCalories: 2400,
          eatenCalories: 2100,
          exercise: { activeCalories: 0, otherCalories: 600, activitySteps: 0 },
          backgroundStepCalories: 200,
          userPreferences: {
            ...inputs().userPreferences,
            calorie_goal_adjustment_mode: mode,
            goal_mode_calculation_method: 'adaptive',
            include_bmr_in_net_calories: true,
            exercise_calorie_percentage: 50,
          },
        })
      );

      expect(balance.goal).toBe(2400);
      expect(balance.remaining).toBe(300);
      expect(balance.progress).toBe(88);
      // Activity still belongs in the burn/net statistics, even though the
      // full-day target already includes it.
      expect(balance.burned).toBe(2800);
      expect(balance.net).toBe(-700);
    }
  );

  test('the default dynamic mode also respects the adaptive baseline', () => {
    const balance = computeCalorieBalance(
      inputs({
        backgroundStepCalories: 300,
        userPreferences: { goal_mode_calculation_method: 'adaptive' },
      })
    );
    expect(balance.remaining).toBe(1962 - 2000);
  });

  test.each([
    ['dynamic', 700],
    ['percentage', 450],
  ] as const)(
    '%s preserves manual-target credit when BMR is unavailable',
    (mode, expectedRemaining) => {
      vi.mocked(bmrService.calculateBmr).mockReturnValue(0);
      const balance = computeCalorieBalance(
        inputs({
          adjustedGoalCalories: 2000,
          eatenCalories: 1800,
          exercise: { activeCalories: 0, otherCalories: 500, activitySteps: 0 },
          userPreferences: {
            ...inputs().userPreferences,
            calorie_goal_adjustment_mode: mode,
            goal_mode_calculation_method: 'adaptive',
            exercise_calorie_percentage: 50,
          },
        })
      );
      // goalService cannot replace the stored target when BMR is zero.
      expect(balance.remaining).toBe(expectedRemaining);
    }
  );
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

describe('resolveDeviceProjectionSnapshot', () => {
  test('uses the device capture time for today without duplicating caller preparation', () => {
    const snapshot = resolveDeviceProjectionSnapshot({
      date: '2026-08-20',
      timezone: 'UTC',
      now: new Date('2026-08-20T18:00:00Z'),
      deviceTotal: {
        totalCalories: 1200,
        capturedAt: new Date('2026-08-20T12:00:00Z'),
      },
    });

    expect(snapshot).toEqual({
      deviceTotalCalories: 1200,
      deviceTotalDayFraction: 0.5,
      dayFraction: 0.75,
    });
  });

  test('treats a completed day and its recorded total as final', () => {
    const snapshot = resolveDeviceProjectionSnapshot({
      date: '2026-08-19',
      timezone: 'UTC',
      now: new Date('2026-08-20T18:00:00Z'),
      deviceTotal: {
        totalCalories: 2400,
        capturedAt: new Date('2026-08-19T20:00:00Z'),
      },
    });

    expect(snapshot).toEqual({
      deviceTotalCalories: 2400,
      deviceTotalDayFraction: 1,
      dayFraction: 1,
    });
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
    // The override is opt-in; this block exercises it turned on.
    use_external_bmr: true,
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

  // A bad sample must not be able to zero out the day's target, nor become the RMR
  // safety floor. 350 is the reading from issue #2395 that the old 300-10000 range
  // let through and 600-6000 rejects.
  test.each([599, 6001, 350, 0, -50])(
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

  // Relative band: a reading can sit inside the absolute bounds and still be
  // implausible for a particular body. BMR here is the formula estimate.
  test.each([
    [Math.round(BMR * 0.5), 'far below the formula estimate'],
    [Math.round(BMR * 1.9), 'far above the formula estimate'],
  ])('keeps the formula BMR when the measured value %s is %s', (value) => {
    const balance = computeCalorieBalance(
      inputs({
        measurements: { weight: 80, height: 180, bmr: value },
        userPreferences: prefs,
      })
    );

    expect(balance.bmr).toBe(BMR);
    expect(balance.bmrSource).toBe('formula');
  });

  test.each([
    [Math.round(BMR * 0.7), 'below but within the band'],
    [Math.round(BMR * 1.5), 'above but within the band'],
  ])('accepts a measured value %s that is %s', (value) => {
    const balance = computeCalorieBalance(
      inputs({
        measurements: { weight: 80, height: 180, bmr: value },
        userPreferences: prefs,
      })
    );

    expect(balance.bmr).toBe(value);
    expect(balance.bmrSource).toBe('measured');
  });

  test.each([BMR * 0.6, BMR * 1.6])(
    'accepts the ratio boundary value %s',
    (value) => {
      const balance = computeCalorieBalance(
        inputs({
          measurements: { weight: 80, height: 180, bmr: value },
          userPreferences: prefs,
        })
      );

      expect(balance.bmr).toBe(value);
      expect(balance.bmrSource).toBe('measured');
    }
  );

  // With no profile there is no formula estimate to compare against, so only the
  // absolute bounds apply. They must stay meaningful on their own: this is the
  // path where the old 300-10000 range let issue #2395's 350 kcal reading through.
  test.each([
    [600, 'measured'],
    [6000, 'measured'],
    [350, 'formula'],
    [9000, 'formula'],
  ])(
    'falls back to the absolute bounds without a formula estimate: %s',
    (value, expectedSource) => {
      const balance = computeCalorieBalance(
        inputs({
          measurements: { weight: 80, height: 180, bmr: value },
          userPreferences: prefs,
          userProfile: null,
        })
      );

      expect(balance.bmrSource).toBe(expectedSource);
    }
  );

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
