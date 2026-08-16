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
});
