import {
  ACTIVITY_MULTIPLIERS,
  resolveExerciseCalories,
  computeSparkyfitnessBurned,
  computeProjectedBurn,
  computeTdeeAdjustment,
  computeCaloriesRemaining,
  computeExerciseCredited,
  computeCalorieProgress,
} from '@/utils/calorieCalculations';
import { computeCalorieTarget, getGoalModeDeficit } from '@workspace/shared';

// ---------------------------------------------------------------------------
// ACTIVITY_MULTIPLIERS
// ---------------------------------------------------------------------------
describe('ACTIVITY_MULTIPLIERS', () => {
  it('has expected multiplier for each level', () => {
    expect(ACTIVITY_MULTIPLIERS['not_much']).toBe(1.2);
    expect(ACTIVITY_MULTIPLIERS['light']).toBe(1.375);
    expect(ACTIVITY_MULTIPLIERS['moderate']).toBe(1.55);
    expect(ACTIVITY_MULTIPLIERS['heavy']).toBe(1.725);
  });
});

// ---------------------------------------------------------------------------
// resolveExerciseCalories
// ---------------------------------------------------------------------------
describe('resolveExerciseCalories', () => {
  it('returns sum of logged and steps when greater than active', () => {
    // workoutPlusSteps = 300 + 100 = 400. 400 > 200.
    expect(resolveExerciseCalories(300, 200, 100)).toEqual({
      calories: 400,
      source: 'logged',
    });
  });

  it('active calories take priority when higher than workout + steps', () => {
    // workoutPlusSteps = 100 + 300 = 400. 500 > 400.
    expect(resolveExerciseCalories(100, 500, 300)).toEqual({
      calories: 500,
      source: 'active',
    });
  });

  it('falls back to active calories when no logged exercises and active is higher than steps', () => {
    // workoutPlusSteps = 0 + 100 = 100. 200 > 100.
    expect(resolveExerciseCalories(0, 200, 100)).toEqual({
      calories: 200,
      source: 'active',
    });
  });

  it('steps take priority over active calories if steps are higher', () => {
    // workoutPlusSteps = 0 + 500 = 500. 500 > 100.
    expect(resolveExerciseCalories(0, 100, 500)).toEqual({
      calories: 500,
      source: 'steps',
    });
  });

  it('falls back to steps when no logged exercises or active calories', () => {
    expect(resolveExerciseCalories(0, 0, 150)).toEqual({
      calories: 150,
      source: 'steps',
    });
  });

  it('returns none when all sources are 0', () => {
    expect(resolveExerciseCalories(0, 0, 0)).toEqual({
      calories: 0,
      source: 'none',
    });
  });
});

// ---------------------------------------------------------------------------
// computeSparkyfitnessBurned
// ---------------------------------------------------------------------------
describe('computeSparkyfitnessBurned', () => {
  it('multiplies BMR by the not_much multiplier', () => {
    expect(computeSparkyfitnessBurned(2000, 'not_much')).toBe(2400);
  });

  it('multiplies BMR by the moderate multiplier', () => {
    expect(computeSparkyfitnessBurned(2000, 'moderate')).toBe(3100);
  });

  it('falls back to the not_much multiplier for unknown activity level', () => {
    expect(computeSparkyfitnessBurned(2000, 'unknown_level')).toBe(2400);
  });

  it('returns 0 when BMR is 0', () => {
    expect(computeSparkyfitnessBurned(0, 'moderate')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeProjectedBurn
// ---------------------------------------------------------------------------
describe('computeProjectedBurn', () => {
  const makeTime = (hours: number, minutes: number) => {
    const d = new Date(2024, 0, 1, hours, minutes, 0);
    return d;
  };

  it('extrapolates device calories when day fraction >= 5%', () => {
    // 12:00 = 50% of day elapsed
    const now = makeTime(12, 0);
    // 500 burned so far → projected 1000 full day; + 1800 BMR = 2800
    expect(computeProjectedBurn(1800, 500, now)).toBe(2800);
  });

  it('does not extrapolate before 5% of day has passed', () => {
    // 00:30 = 2.1% of day — below threshold
    const now = makeTime(0, 30);
    // Just uses raw device calories: 200 + 1800 = 2000
    expect(computeProjectedBurn(1800, 200, now)).toBe(2000);
  });

  it('does not extrapolate when exerciseCaloriesBurned is 0', () => {
    const now = makeTime(12, 0);
    // 0 device calories → no projection needed; 0 + 1800 = 1800
    expect(computeProjectedBurn(1800, 0, now)).toBe(1800);
  });

  it('defaults to current time when no date argument provided', () => {
    // Just ensure it does not throw
    expect(() => computeProjectedBurn(2000, 300)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// computeTdeeAdjustment
// ---------------------------------------------------------------------------
describe('computeTdeeAdjustment', () => {
  it('returns positive adjustment when projected > TDEE baseline', () => {
    expect(computeTdeeAdjustment(3000, 2500, false)).toBe(500);
  });

  it('clamps negative adjustment to 0 when allowNegative is false', () => {
    expect(computeTdeeAdjustment(2000, 2500, false)).toBe(0);
  });

  it('returns negative adjustment when allowNegative is true', () => {
    expect(computeTdeeAdjustment(2000, 2500, true)).toBe(-500);
  });

  it('returns 0 when projected equals TDEE baseline', () => {
    expect(computeTdeeAdjustment(2500, 2500, false)).toBe(0);
    expect(computeTdeeAdjustment(2500, 2500, true)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeCaloriesRemaining
// ---------------------------------------------------------------------------
describe('computeCaloriesRemaining', () => {
  const base = {
    goalCalories: 2000,
    eatenCalories: 1500,
    netCalories: 1200,
    exerciseCaloriesBurned: 400,
    bmrCalories: 300,
    exerciseCaloriePercentage: 50,
    tdeeAdjustment: 200,
  };

  it('tdee mode: goal - eaten + tdeeAdjustment', () => {
    expect(computeCaloriesRemaining({ ...base, mode: 'tdee' })).toBe(700);
  });

  it('dynamic mode: goal - netCalories', () => {
    expect(computeCaloriesRemaining({ ...base, mode: 'dynamic' })).toBe(800);
  });

  it('percentage mode: credits only the configured percentage of exercise calories', () => {
    // adjustedExercise = 400 * 0.5 = 200; adjustedTotal = 200 + 300 = 500
    // remaining = 2000 - (1500 - 500) = 1000
    expect(computeCaloriesRemaining({ ...base, mode: 'percentage' })).toBe(
      1000
    );
  });

  it('fixed mode: goal - eaten (no exercise credit)', () => {
    expect(computeCaloriesRemaining({ ...base, mode: 'fixed' })).toBe(500);
  });

  it('defaults to fixed behaviour for unknown mode', () => {
    expect(
      computeCaloriesRemaining({
        ...base,
        mode: 'unknown' as 'fixed',
      })
    ).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// computeExerciseCredited
// ---------------------------------------------------------------------------
describe('computeExerciseCredited', () => {
  it('returns the calories exercise has added to the budget', () => {
    // Without exercise: 2000 - 1500 = 500 remaining
    // With exercise: 800 remaining → credited = 300
    expect(computeExerciseCredited(800, 2000, 1500)).toBe(300);
  });

  it('returns 0 when exercise adds nothing (fixed mode result)', () => {
    expect(computeExerciseCredited(500, 2000, 1500)).toBe(0);
  });

  it('never returns a negative value', () => {
    // Remaining is less than base (unusual edge case)
    expect(computeExerciseCredited(200, 2000, 1500)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeCalorieProgress
// ---------------------------------------------------------------------------
describe('computeCalorieProgress', () => {
  it('returns 50% when half the goal is consumed', () => {
    expect(computeCalorieProgress(2000, 1000)).toBe(50);
  });

  it('returns 0% when nothing is consumed', () => {
    expect(computeCalorieProgress(2000, 2000)).toBe(0);
  });

  it('returns 100% when goal is fully consumed', () => {
    expect(computeCalorieProgress(2000, 0)).toBe(100);
  });

  it('returns > 100% when over the goal', () => {
    expect(computeCalorieProgress(2000, -500)).toBeGreaterThan(100);
  });

  it('clamps to 0 and never goes negative', () => {
    // remaining > goal means nothing consumed
    expect(computeCalorieProgress(2000, 3000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getGoalModeDeficit
// ---------------------------------------------------------------------------
describe('getGoalModeDeficit', () => {
  it('returns correct deficits for standard modes', () => {
    expect(getGoalModeDeficit('maintain')).toBe(0.0);
    expect(getGoalModeDeficit('recomp')).toBe(0.1);
    expect(getGoalModeDeficit('cut')).toBe(0.15);
    expect(getGoalModeDeficit('high_cut')).toBe(0.2);
  });

  it('handles custom percentage in manual mode', () => {
    expect(getGoalModeDeficit('manual', 12)).toBe(0.12);
    expect(getGoalModeDeficit('manual', 45)).toBe(0.4); // capped at 40%
  });
});

// ---------------------------------------------------------------------------
// computeCalorieTarget
// ---------------------------------------------------------------------------
describe('computeCalorieTarget', () => {
  it('calculates correct targets under manual goal mode', () => {
    const result = computeCalorieTarget({
      goalMode: 'recomp',
      calculationMethod: 'manual',
      customPercentage: 0,
      bmr: 1500,
      activityLevelMultiplier: 1.2,
      adaptiveTdee: null,
      adaptiveTdeeFallback: true,
      adaptiveTdeeDaysOfData: 0,
      weightKg: 70,
      heightCm: 170,
      age: 30,
      gender: 'male',
      currentGoalCalories: 2000,
    });
    expect(result.finalTarget).toBe(1800);
    expect(result.appliedDeficit).toBe(200);
  });

  it('applies fallback and caps at safety floor under adaptive method', () => {
    const result = computeCalorieTarget({
      goalMode: 'high_cut',
      calculationMethod: 'adaptive',
      customPercentage: 0,
      bmr: 1800,
      activityLevelMultiplier: 1.2,
      adaptiveTdee: null,
      adaptiveTdeeFallback: true,
      adaptiveTdeeDaysOfData: 0,
      weightKg: 80,
      heightCm: 180,
      age: 35,
      gender: 'male',
      currentGoalCalories: 2000,
    });
    // Target 2160 * 0.8 = 1728, gets auto-raised to max(1800 BMR, 1500 absolute) = 1800
    expect(result.target).toBe(1728);
    expect(result.finalTarget).toBe(1800);
  });
});
