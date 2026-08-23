import {
  ACTIVITY_MULTIPLIERS,
  resolveExerciseCalories,
  computeSparkyfitnessBurned,
  computeProjectedBurn,
  computeTdeeAdjustment,
  computeCaloriesRemaining,
  computeExerciseCredited,
  computeCalorieProgress,
  normalizeCalorieGoalAdjustmentMode,
  shouldShowCalorieSafetyWarning,
  isAdaptiveTdeeMature,
  ADAPTIVE_TDEE_GOAL_MIN_DAYS,
  convertEnergyValue,
} from '@workspace/shared';
import {
  computeCalorieTarget,
  getGoalModeAdjustment,
  isGainGoalMode,
} from '@workspace/shared';

// ---------------------------------------------------------------------------
// ACTIVITY_MULTIPLIERS
// ---------------------------------------------------------------------------
describe('ACTIVITY_MULTIPLIERS', () => {
  it('has expected multiplier for each level', () => {
    expect(ACTIVITY_MULTIPLIERS['none']).toBe(1.0);
    expect(ACTIVITY_MULTIPLIERS['not_much']).toBe(1.2);
    expect(ACTIVITY_MULTIPLIERS['light']).toBe(1.375);
    expect(ACTIVITY_MULTIPLIERS['moderate']).toBe(1.55);
    expect(ACTIVITY_MULTIPLIERS['heavy']).toBe(1.725);
  });
});

describe('convertEnergyValue', () => {
  it('converts energy in both directions without rounding away precision', () => {
    expect(convertEnergyValue(100, 'kcal', 'kJ')).toBeCloseTo(418.4, 5);
    expect(convertEnergyValue(418.4, 'kJ', 'kcal')).toBeCloseTo(100, 5);
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

  it('applies no multiplier for the "none" activity level', () => {
    expect(computeSparkyfitnessBurned(2000, 'none')).toBe(2000);
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
// getGoalModeAdjustment
// ---------------------------------------------------------------------------
describe('getGoalModeAdjustment', () => {
  it('returns correct deficits for standard modes', () => {
    expect(getGoalModeAdjustment('maintain')).toBe(0.0);
    expect(getGoalModeAdjustment('recomp')).toBe(0.1);
    expect(getGoalModeAdjustment('cut')).toBe(0.15);
    expect(getGoalModeAdjustment('high_cut')).toBe(0.2);
  });

  it('returns negative adjustments (surpluses) for gain modes', () => {
    expect(getGoalModeAdjustment('lean_bulk')).toBe(-0.1);
    expect(getGoalModeAdjustment('bulk')).toBe(-0.2);
  });

  // The stored user percentage is the OPPOSITE orientation to the returned
  // adjustment: positive means "eat more" to the user, but the return value is
  // positive-means-deficit so `baselineTdee * (1 - adjustment)` works directly.
  it('treats a positive custom percentage as a surplus', () => {
    expect(getGoalModeAdjustment('manual', 12)).toBe(-0.12);
    expect(getGoalModeAdjustment('manual', 45)).toBe(-0.4); // capped at 40%
  });

  it('treats a negative custom percentage as a deficit, capped symmetrically', () => {
    expect(getGoalModeAdjustment('manual', -12)).toBe(0.12);
    expect(getGoalModeAdjustment('manual', -45)).toBe(0.4);
  });

  it('identifies gain goals', () => {
    expect(isGainGoalMode('bulk')).toBe(true);
    expect(isGainGoalMode('manual', 5)).toBe(true);
    expect(isGainGoalMode('manual', -5)).toBe(false);
    expect(isGainGoalMode('cut')).toBe(false);
    expect(isGainGoalMode('maintain')).toBe(false);
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
      weightKg: 84.5,
      heightCm: 180,
      age: 35,
      gender: 'male',
      currentGoalCalories: 2000,
    });
    // Target 2160 * 0.8 = 1728, gets auto-raised to max(1800 BMR, 1500 absolute) = 1800
    expect(result.target).toBe(1728);
    expect(result.finalTarget).toBe(1800);
  });

  it('targets the adaptive TDEE exactly under maintain with sufficient data', () => {
    const result = computeCalorieTarget({
      goalMode: 'maintain',
      calculationMethod: 'adaptive',
      customPercentage: 0,
      bmr: 1800,
      activityLevelMultiplier: 1.2,
      adaptiveTdee: 2194,
      adaptiveTdeeFallback: false,
      adaptiveTdeeDaysOfData: 35,
      weightKg: 84.5,
      heightCm: 180,
      age: 35,
      gender: 'male',
      currentGoalCalories: 2000,
    });
    expect(result.baselineTdee).toBe(2194);
    expect(result.appliedDeficit).toBe(0);
    // 2194 > max(1800 RMR, 1500 absolute), so no floor clamp
    expect(result.finalTarget).toBe(2194);
    expect(result.insufficientHistory).toBe(false);
  });

  it('keeps the adaptive baseline constant across all goal modes (issue #1710)', () => {
    const goalModes = ['maintain', 'recomp', 'cut', 'high_cut', 'manual'];
    for (const goalMode of goalModes) {
      const result = computeCalorieTarget({
        goalMode,
        calculationMethod: 'adaptive',
        // Non-zero percentage on the 'manual' iteration must not leak into the baseline
        customPercentage: 12,
        bmr: 1800,
        activityLevelMultiplier: 1.2,
        adaptiveTdee: 2194,
        adaptiveTdeeFallback: false,
        adaptiveTdeeDaysOfData: 35,
        weightKg: 84.5,
        heightCm: 180,
        age: 35,
        gender: 'male',
        currentGoalCalories: 2000,
      });
      expect(result.baselineTdee).toBe(2194);
    }
  });

  it('falls back to BMR x activity multiplier under maintain with insufficient history', () => {
    const result = computeCalorieTarget({
      goalMode: 'maintain',
      calculationMethod: 'adaptive',
      customPercentage: 0,
      bmr: 1800,
      activityLevelMultiplier: 1.2,
      adaptiveTdee: null,
      adaptiveTdeeFallback: true,
      adaptiveTdeeDaysOfData: 0,
      weightKg: 84.5,
      heightCm: 180,
      age: 35,
      gender: 'male',
      currentGoalCalories: 2000,
    });
    expect(result.baselineTdee).toBe(2160);
    expect(result.insufficientHistory).toBe(true);
    expect(result.appliedDeficit).toBe(0);
    expect(result.finalTarget).toBe(2160);
  });
});

// ---------------------------------------------------------------------------
// Weight gain (surplus) goals
// ---------------------------------------------------------------------------
describe('computeCalorieTarget with gain goals', () => {
  const gainBase = {
    calculationMethod: 'adaptive' as const,
    customPercentage: 0,
    bmr: 1800,
    activityLevelMultiplier: 1.2,
    adaptiveTdee: 2500,
    adaptiveTdeeFallback: false,
    adaptiveTdeeDaysOfData: 30,
    weightKg: 80,
    heightCm: 180,
    age: 35,
    gender: 'male' as const,
    currentGoalCalories: 2500,
  };

  it('produces a target above the baseline for a lean bulk', () => {
    const result = computeCalorieTarget({ ...gainBase, goalMode: 'lean_bulk' });

    expect(result.isGainGoal).toBe(true);
    expect(result.finalTarget).toBe(2750); // 2500 * (1 - -0.10)
    expect(result.finalTarget).toBeGreaterThan(result.baselineTdee);
    expect(result.appliedDeficit).toBe(-250); // negative means surplus
  });

  it('projects weight gain as a positive change', () => {
    const result = computeCalorieTarget({ ...gainBase, goalMode: 'lean_bulk' });

    // 250 kcal/day surplus * 7 / 6000 kcal per kg
    expect(result.projectedWeeklyChangeKg).toBeCloseTo(0.2917, 3);
    expect(result.projectedWeeklyChangeKg).toBeGreaterThan(0);
    expect(result.projectedWeeklyChangePercent).toBeCloseTo(0.3646, 3);
  });

  it('still reports weight loss as a negative change', () => {
    const result = computeCalorieTarget({ ...gainBase, goalMode: 'cut' });

    expect(result.isGainGoal).toBe(false);
    expect(result.projectedWeeklyChangeKg).toBeLessThan(0);
  });

  it('applies tighter safety thresholds to gain than to loss', () => {
    // ~0.36%/week is green for loss but yellow for gain.
    const gain = computeCalorieTarget({ ...gainBase, goalMode: 'lean_bulk' });
    expect(gain.safetyZone).toBe('yellow');

    const loss = computeCalorieTarget({
      ...gainBase,
      goalMode: 'manual',
      customPercentage: -10,
    });
    expect(loss.projectedWeeklyChangePercent).toBeCloseTo(0.3646, 3);
    expect(loss.safetyZone).toBe('green');
  });

  it('flags an aggressive surplus as red', () => {
    const result = computeCalorieTarget({ ...gainBase, goalMode: 'bulk' });
    expect(result.projectedWeeklyChangePercent).toBeGreaterThan(0.5);
    expect(result.safetyZone).toBe('red');
  });

  it('never trips the safety floor for a surplus above the floor', () => {
    const result = computeCalorieTarget({ ...gainBase, goalMode: 'bulk' });
    expect(result.wasClampedToFloor).toBe(false);
    expect(result.clampedFloorSource).toBeNull();
    // The ceiling is reported regardless of the selected mode — it describes the
    // floor, not this goal — so a gain goal still carries the deficit headroom.
    expect(result.maxFeasibleDeficitPercent).not.toBeNull();
  });

  it('accepts a positive custom percentage as a manual surplus', () => {
    const result = computeCalorieTarget({
      ...gainBase,
      goalMode: 'manual',
      customPercentage: 15,
    });
    expect(result.isGainGoal).toBe(true);
    expect(result.finalTarget).toBe(2875);
  });
});

// ---------------------------------------------------------------------------
// Safety floor reporting (the small-stature case)
// ---------------------------------------------------------------------------
describe('computeCalorieTarget safety floor reporting', () => {
  // A small woman: measured TDEE 1400, so a 15% cut lands under the 1200 floor.
  const smallBase = {
    customPercentage: 0,
    bmr: 1150,
    activityLevelMultiplier: 1.2,
    adaptiveTdee: 1400,
    adaptiveTdeeFallback: false,
    adaptiveTdeeDaysOfData: 30,
    weightKg: 50,
    heightCm: 150,
    age: 35,
    gender: 'female' as const,
    currentGoalCalories: 1400,
  };

  it('reports the clamp instead of applying it silently', () => {
    const result = computeCalorieTarget({
      ...smallBase,
      goalMode: 'cut',
      calculationMethod: 'adaptive',
    });

    expect(result.target).toBe(1190); // what the user asked for
    expect(result.finalTarget).toBe(1200); // what they actually get
    expect(result.wasClampedToFloor).toBe(true);
    expect(result.clampedFloorSource).toBe('absolute');
  });

  it('offers the largest deficit that still clears the floor', () => {
    const result = computeCalorieTarget({
      ...smallBase,
      goalMode: 'cut',
      calculationMethod: 'adaptive',
    });

    // 1 - 1200/1400 = 14.28%
    expect(result.maxFeasibleDeficitPercent).toBeCloseTo(14.29, 1);
  });

  it('names RMR as the binding floor when it exceeds the absolute minimum', () => {
    // A larger woman: RMR ~1682 sits well above the flat 1200 floor, so a 20%
    // cut off a 2000 kcal TDEE is bound by her own metabolism, not the minimum.
    const result = computeCalorieTarget({
      ...smallBase,
      weightKg: 90,
      heightCm: 175,
      age: 30,
      adaptiveTdee: 2000,
      currentGoalCalories: 2000,
      goalMode: 'high_cut',
      calculationMethod: 'adaptive',
    });

    expect(result.rmr).toBeGreaterThan(result.absoluteFloorValue);
    expect(result.wasClampedToFloor).toBe(true);
    expect(result.clampedFloorSource).toBe('rmr');
    expect(result.finalTarget).toBe(result.rmr);
  });

  it('does not clamp under the manual method, leaving the warning flags to speak', () => {
    const result = computeCalorieTarget({
      ...smallBase,
      goalMode: 'cut',
      calculationMethod: 'manual',
    });

    expect(result.wasClampedToFloor).toBe(false);
    expect(result.finalTarget).toBe(1190); // the user gets what they asked for
    expect(result.isBelowAbsoluteFloor).toBe(true);
  });

  it('uses a custom floor instead of forcing the higher calculated RMR (issue #2124)', () => {
    const result = computeCalorieTarget({
      ...smallBase,
      weightKg: 88,
      heightCm: 175,
      age: 30,
      adaptiveTdee: 1606,
      currentGoalCalories: 1606,
      goalMode: 'maintain',
      calculationMethod: 'adaptive',
      calorieSafetyFloorMode: 'custom',
      calorieSafetyFloorValue: 1200,
    });

    expect(result.rmr).toBeGreaterThan(1606);
    expect(result.finalTarget).toBe(1606);
    expect(result.effectiveSafetyFloor).toBe(1200);
    expect(result.wasClampedToFloor).toBe(false);
  });

  it('clamps to the configured custom floor and identifies it as the source', () => {
    const result = computeCalorieTarget({
      ...smallBase,
      adaptiveTdee: 1300,
      currentGoalCalories: 1300,
      goalMode: 'high_cut',
      calculationMethod: 'adaptive',
      calorieSafetyFloorMode: 'custom',
      calorieSafetyFloorValue: 1100,
    });

    expect(result.target).toBe(1040);
    expect(result.finalTarget).toBe(1100);
    expect(result.effectiveSafetyFloor).toBe(1100);
    expect(result.clampedFloorSource).toBe('custom');
  });

  it('does not clamp an adaptive target when the floor is disabled', () => {
    const result = computeCalorieTarget({
      ...smallBase,
      goalMode: 'cut',
      calculationMethod: 'adaptive',
      calorieSafetyFloorMode: 'disabled',
      calorieSafetyFloorValue: 1200,
    });

    expect(result.finalTarget).toBe(1190);
    expect(result.effectiveSafetyFloor).toBeNull();
    expect(result.wasClampedToFloor).toBe(false);
    expect(result.clampedFloorSource).toBeNull();
  });
});

describe('deficit ceiling is available before the clamp (issue #2205)', () => {
  // Same body throughout; only the activity multiplier moves. The ceiling is
  // 1 - 1/multiplier, so it is a property of activity, not body size.
  const at = (multiplier: number, goalMode = 'maintain') => {
    const bmr = 1633;
    const tdee = Math.round(bmr * multiplier);
    return computeCalorieTarget({
      goalMode,
      calculationMethod: 'adaptive',
      customPercentage: 0,
      bmr,
      activityLevelMultiplier: multiplier,
      adaptiveTdee: tdee,
      adaptiveTdeeFallback: false,
      adaptiveTdeeDaysOfData: 60,
      weightKg: 100,
      heightCm: 155,
      age: 35,
      gender: 'female',
      currentGoalCalories: tdee,
    });
  };

  it('reports the ceiling even when the current mode does not trip the floor', () => {
    const result = at(1.2, 'maintain');

    expect(result.wasClampedToFloor).toBe(false);
    expect(result.maxFeasibleDeficitPercent).toBeCloseTo(16.7, 1);
  });

  it('is effectively zero at the None activity level, where every deficit mode is clamped', () => {
    // TDEE equals RMR there, so no deficit clears the floor at all.
    expect(at(1.0).maxFeasibleDeficitPercent).toBeLessThan(0.1);
  });

  it('does not depend on which goal mode is selected', () => {
    const ceilings = ['maintain', 'recomp', 'cut', 'high_cut'].map(
      (mode) => at(1.2, mode).maxFeasibleDeficitPercent
    );

    expect(new Set(ceilings.map((c) => c!.toFixed(6))).size).toBe(1);
  });

  it('rises with activity level', () => {
    expect(at(1.375).maxFeasibleDeficitPercent).toBeCloseTo(27.3, 1);
    expect(at(1.55).maxFeasibleDeficitPercent).toBeCloseTo(35.5, 1);
  });

  it('is null under the manual method, which never clamps', () => {
    const result = computeCalorieTarget({
      goalMode: 'high_cut',
      calculationMethod: 'manual',
      customPercentage: 0,
      bmr: 1633,
      activityLevelMultiplier: 1.2,
      adaptiveTdee: 1959,
      adaptiveTdeeFallback: false,
      adaptiveTdeeDaysOfData: 60,
      weightKg: 100,
      heightCm: 155,
      age: 35,
      gender: 'female',
      currentGoalCalories: 1959,
    });

    expect(result.maxFeasibleDeficitPercent).toBeNull();
  });
});

describe('isAdaptiveTdeeMature', () => {
  // AdaptiveTdeeService releases a raw estimate at 7 days; goals wait for the
  // stabler window. The gap between those two numbers is where the saved goal and
  // the settings preview used to disagree.
  it.each([0, 6, 7, 13])('rejects a measured estimate at %i days', (days) => {
    expect(isAdaptiveTdeeMature(1800, false, days)).toBe(false);
  });

  it.each([14, 30])('accepts a measured estimate at %i days', (days) => {
    expect(isAdaptiveTdeeMature(1800, false, days)).toBe(true);
  });

  it('rejects a fallback estimate no matter how much history backs it', () => {
    expect(isAdaptiveTdeeMature(1800, true, 365)).toBe(false);
  });

  // The service always sets the flag, but the web types it optional and forwards
  // it unmodified, so an unknown provenance must not be read as "measured".
  it.each([null, undefined])(
    'rejects an estimate whose fallback status is %p',
    (isFallback) => {
      expect(isAdaptiveTdeeMature(1800, isFallback, 365)).toBe(false);
    }
  );

  it('rejects a missing or unusable estimate', () => {
    expect(isAdaptiveTdeeMature(null, false, 30)).toBe(false);
    expect(isAdaptiveTdeeMature(undefined, false, 30)).toBe(false);
    expect(isAdaptiveTdeeMature(0, false, 30)).toBe(false);
    expect(isAdaptiveTdeeMature(NaN, false, 30)).toBe(false);
  });

  it('treats a missing day count as no history', () => {
    expect(isAdaptiveTdeeMature(1800, false, null)).toBe(false);
    expect(isAdaptiveTdeeMature(1800, false, undefined)).toBe(false);
  });

  it('is the threshold computeCalorieTarget actually applies', () => {
    const base = {
      goalMode: 'maintain',
      calculationMethod: 'adaptive' as const,
      customPercentage: 0,
      bmr: 1600,
      activityLevelMultiplier: 1.2,
      adaptiveTdee: 1420,
      adaptiveTdeeFallback: false,
      weightKg: 80,
      heightCm: 178,
      age: 36,
      gender: 'male' as const,
      currentGoalCalories: 1900,
    };

    const immature = computeCalorieTarget({
      ...base,
      adaptiveTdeeDaysOfData: ADAPTIVE_TDEE_GOAL_MIN_DAYS - 1,
    });
    const mature = computeCalorieTarget({
      ...base,
      adaptiveTdeeDaysOfData: ADAPTIVE_TDEE_GOAL_MIN_DAYS,
    });

    expect(immature.insufficientHistory).toBe(true);
    expect(immature.baselineTdee).toBe(1920);
    expect(mature.insufficientHistory).toBe(false);
    expect(mature.baselineTdee).toBe(1420);
  });
});

describe('shouldShowCalorieSafetyWarning', () => {
  it('does not warn while maintaining weight', () => {
    expect(shouldShowCalorieSafetyWarning('maintain')).toBe(false);
  });

  it.each(['recomp', 'cut', 'high_cut', 'lean_bulk', 'bulk', 'manual'])(
    'warns for a non-maintenance %s goal regardless of method',
    (goalMode) => {
      expect(shouldShowCalorieSafetyWarning(goalMode)).toBe(true);
    }
  );
});

describe('safety warnings reach a relaxed adaptive floor', () => {
  // A custom or disabled floor lets an adaptive target land below RMR. Gating the
  // warning on the manual method used to silence it there, which is precisely
  // where it matters: the floor never clamps under manual in the first place.
  const base = {
    goalMode: 'high_cut',
    calculationMethod: 'adaptive' as const,
    customPercentage: 0,
    bmr: 1633,
    activityLevelMultiplier: 1.2,
    adaptiveTdee: 1959,
    adaptiveTdeeFallback: false,
    adaptiveTdeeDaysOfData: 60,
    weightKg: 100,
    heightCm: 155,
    age: 35,
    gender: 'female' as const,
    currentGoalCalories: 1959,
  };

  it('produces a below-RMR target the warning must cover', () => {
    const result = computeCalorieTarget({
      ...base,
      calorieSafetyFloorMode: 'disabled',
    });

    expect(result.finalTarget).toBeLessThan(result.rmr);
    expect(shouldShowCalorieSafetyWarning(base.goalMode)).toBe(true);
  });

  it('stays quiet when the standard floor already clamped the target', () => {
    const result = computeCalorieTarget({
      ...base,
      calorieSafetyFloorMode: 'standard',
    });

    // The helper is permissive; the outcome comparison is what silences it.
    expect(result.finalTarget).toBeGreaterThanOrEqual(result.rmr);
  });
});

describe('normalizeCalorieGoalAdjustmentMode', () => {
  it("maps 'smart' onto 'tdee' so mode branches can't silently exclude it", () => {
    expect(normalizeCalorieGoalAdjustmentMode('smart')).toBe('tdee');
  });

  it.each(['dynamic', 'fixed', 'percentage', 'tdee', 'adaptive'] as const)(
    'leaves %s untouched',
    (mode) => {
      expect(normalizeCalorieGoalAdjustmentMode(mode)).toBe(mode);
    }
  );

  it.each([undefined, null, ''])(
    'falls back to dynamic for %p, matching the server default',
    (mode) => {
      expect(normalizeCalorieGoalAdjustmentMode(mode)).toBe('dynamic');
    }
  );

  /**
   * `smart` and `tdee` share a branch in `computeCaloriesRemaining`, which is what makes
   * collapsing them safe. If that ever stops being true, normalizing becomes a bug.
   */
  it('is only safe because smart and tdee compute the same remaining', () => {
    const params = {
      goalCalories: 2000,
      eatenCalories: 1800,
      netCalories: 1500,
      exerciseCaloriesBurned: 300,
      bmrCalories: 0,
      exerciseCaloriePercentage: 100,
      tdeeAdjustment: 250,
    };

    expect(computeCaloriesRemaining({ ...params, mode: 'smart' })).toBe(
      computeCaloriesRemaining({ ...params, mode: 'tdee' })
    );
  });
});
