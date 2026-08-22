import {
  calculateBasePlan,
  type CalculatorFormData,
} from '@/utils/nutritionCalculations';
import { ACTIVITY_MULTIPLIERS, calculateBmr } from '@workspace/shared';

const NO_CUSTOM = { carbs: 0, protein: 0, fat: 0 };

// 35-year-old male, 84.5 kg, 180 cm, moderately active.
const baseForm: CalculatorFormData = {
  sex: 'male',
  primaryGoal: 'maintain_weight',
  currentWeight: 84.5,
  height: 180,
  birthDate: `${new Date().getFullYear() - 35}-01-01`,
  activityLevel: 'moderate',
};

const expectedTdee = Math.round(
  calculateBmr('Mifflin-St Jeor', 84.5, 180, 35, 'male') *
    (ACTIVITY_MULTIPLIERS['moderate'] ?? 1.2)
);

describe('calculateBasePlan goal handling', () => {
  it('returns null when required inputs are missing', () => {
    expect(
      calculateBasePlan(
        { ...baseForm, currentWeight: '' },
        'balanced',
        NO_CUSTOM
      )
    ).toBeNull();
  });

  it('targets maintenance calories when the goal is to maintain', () => {
    const plan = calculateBasePlan(baseForm, 'balanced', NO_CUSTOM);

    expect(plan).not.toBeNull();
    // Baseline is BMR x activity multiplier, within rounding.
    expect(Math.abs(plan!.tdee - expectedTdee)).toBeLessThanOrEqual(10);
    // Rounded to the nearest 10 for presentation.
    expect(plan!.finalDailyCalories).toBe(Math.round(plan!.tdee / 10) * 10);
  });

  it('applies a deficit for weight loss, matching the cut goal mode', () => {
    const plan = calculateBasePlan(
      { ...baseForm, primaryGoal: 'lose_weight' },
      'balanced',
      NO_CUSTOM
    );

    expect(plan!.finalDailyCalories).toBeLessThan(plan!.tdee);
    // 15%, the same deficit the persisted 'cut' goal mode applies afterwards
    // (allowing for the round-to-nearest-10 presentation step).
    expect(
      Math.abs(plan!.finalDailyCalories - plan!.tdee * 0.85)
    ).toBeLessThanOrEqual(10);
  });

  it('applies a surplus for weight gain rather than a flat +500', () => {
    const plan = calculateBasePlan(
      { ...baseForm, primaryGoal: 'gain_weight' },
      'balanced',
      NO_CUSTOM
    );

    expect(plan!.finalDailyCalories).toBeGreaterThan(plan!.tdee);
    // 10%, matching the persisted 'lean_bulk' goal mode.
    expect(
      Math.abs(plan!.finalDailyCalories - plan!.tdee * 1.1)
    ).toBeLessThanOrEqual(10);
    // The old behaviour was a fixed +500 regardless of body size.
    expect(
      Math.abs(plan!.finalDailyCalories - (plan!.tdee + 500))
    ).toBeGreaterThan(10);
  });

  it('scales the surplus with body size, unlike a flat offset', () => {
    const small = calculateBasePlan(
      {
        ...baseForm,
        primaryGoal: 'gain_weight',
        sex: 'female',
        currentWeight: 50,
        height: 150,
        activityLevel: 'not_much',
      },
      'balanced',
      NO_CUSTOM
    );
    const large = calculateBasePlan(
      { ...baseForm, primaryGoal: 'gain_weight' },
      'balanced',
      NO_CUSTOM
    );

    const smallSurplus = small!.finalDailyCalories - small!.tdee;
    const largeSurplus = large!.finalDailyCalories - large!.tdee;
    expect(smallSurplus).toBeGreaterThan(0);
    expect(largeSurplus).toBeGreaterThan(smallSurplus);
  });

  it('never produces a target below the absolute safety floor', () => {
    const plan = calculateBasePlan(
      {
        ...baseForm,
        primaryGoal: 'lose_weight',
        sex: 'female',
        currentWeight: 40,
        height: 145,
        activityLevel: 'not_much',
      },
      'balanced',
      NO_CUSTOM
    );

    expect(plan!.finalDailyCalories).toBeGreaterThanOrEqual(1200);
  });

  it('uses the configured custom floor when calculating a small weight-loss plan', () => {
    const plan = calculateBasePlan(
      {
        ...baseForm,
        primaryGoal: 'lose_weight',
        sex: 'female',
        currentWeight: 40,
        height: 145,
        activityLevel: 'not_much',
      },
      'balanced',
      NO_CUSTOM,
      {
        calorieSafetyFloorMode: 'custom',
        calorieSafetyFloorValue: 1000,
      }
    );

    expect(plan!.finalDailyCalories).toBe(1000);
  });

  it('does not clamp a small weight-loss plan when the floor is disabled', () => {
    const plan = calculateBasePlan(
      {
        ...baseForm,
        primaryGoal: 'lose_weight',
        sex: 'female',
        currentWeight: 40,
        height: 145,
        activityLevel: 'not_much',
      },
      'balanced',
      NO_CUSTOM,
      {
        calorieSafetyFloorMode: 'disabled',
        calorieSafetyFloorValue: 1200,
      }
    );

    expect(plan!.finalDailyCalories).toBe(990);
  });

  // Regression: onboarding persists goalMode, and the goal it saves is this
  // finalDailyCalories -- which already has the adjustment applied. If the
  // calculation method were left at its 'manual' default, goalService would
  // treat the stored goal as a baseline and apply the adjustment AGAIN
  // (cut => TDEE x 0.85 x 0.85). PersonalPlan therefore persists
  // goalModeCalculationMethod: 'adaptive'; this pins the arithmetic that makes
  // the double-application detectable if anyone changes it back.
  it('bakes the goal-mode adjustment into finalDailyCalories exactly once', () => {
    const plan = calculateBasePlan(
      { ...baseForm, primaryGoal: 'lose_weight' },
      'balanced',
      NO_CUSTOM
    );

    // 15% off maintenance, rounded to the nearest 10.
    const expectedOnce = Math.round((plan!.tdee * 0.85) / 10) * 10;
    const compounded = Math.round((plan!.tdee * 0.85 * 0.85) / 10) * 10;

    expect(plan!.finalDailyCalories).toBe(expectedOnce);
    expect(plan!.finalDailyCalories).not.toBe(compounded);
  });
});
