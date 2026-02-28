import {
  ACTIVITY_MULTIPLIERS,
  resolveActiveOrStepsCalories,
  computeSparkyfitnessBurned,
  computeProjectedBurn,
  computeTdeeAdjustment,
  computeCaloriesRemaining,
  computeExerciseCredited,
  computeCalorieProgress,
} from '@/utils/calorieCalculations';

// ---------------------------------------------------------------------------
// ACTIVITY_MULTIPLIERS
// ---------------------------------------------------------------------------
describe('ACTIVITY_MULTIPLIERS', () => {
  it('has expected multiplier for each level', () => {
    expect(ACTIVITY_MULTIPLIERS.not_much).toBe(1.2);
    expect(ACTIVITY_MULTIPLIERS.light).toBe(1.375);
    expect(ACTIVITY_MULTIPLIERS.moderate).toBe(1.55);
    expect(ACTIVITY_MULTIPLIERS.heavy).toBe(1.725);
  });
});

// ---------------------------------------------------------------------------
// resolveActiveOrStepsCalories
// ---------------------------------------------------------------------------
describe('resolveActiveOrStepsCalories', () => {
  it('returns active calories when they are > 0', () => {
    expect(resolveActiveOrStepsCalories(300, 200)).toBe(300);
  });

  it('falls back to steps calories when active calories are 0', () => {
    expect(resolveActiveOrStepsCalories(0, 150)).toBe(150);
  });

  it('returns 0 when both are 0', () => {
    expect(resolveActiveOrStepsCalories(0, 0)).toBe(0);
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
