import { describe, expect, test } from 'vitest';
import {
  CALORIE_CALCULATION_CONSTANTS,
  computeStepCalories,
} from '@workspace/shared';

describe('computeStepCalories', () => {
  test('keeps the shipped stride-multiplier property available', () => {
    expect(CALORIE_CALCULATION_CONSTANTS.STRIDE_LENGTH_MULTIPLIER).toBe(0.414);
  });

  test('uses measured net walking cost for a 40,000-step day', () => {
    // 40,000 steps × (175 cm × 0.414) = 28.98 km. At 70 kg and the
    // measured mean net walking cost of 0.53 kcal/kg/km, that is 1,075 kcal.
    expect(
      computeStepCalories({
        backgroundSteps: 40000,
        weightKg: 70,
        heightCm: 175,
      })
    ).toBe(1075);
  });

  test('scales net walking calories with body mass', () => {
    const lighter = computeStepCalories({
      backgroundSteps: 10000,
      weightKg: 60,
      heightCm: 175,
    });
    const heavier = computeStepCalories({
      backgroundSteps: 10000,
      weightKg: 90,
      heightCm: 175,
    });

    expect(lighter).toBe(230);
    expect(heavier).toBe(346);
  });
});
