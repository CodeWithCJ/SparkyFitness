import { describe, expect, it } from 'vitest';
import { scaleNutritionForConsumedAmount } from '../utils/foodUtils.js';

describe('scaleNutritionForConsumedAmount', () => {
  it('preserves missing nutrient values instead of reporting them as zero', () => {
    expect(
      scaleNutritionForConsumedAmount(75, 100, {
        calories: 351,
        protein: null,
        carbs: undefined,
        fat: '',
      })
    ).toEqual({
      calories: 263.25,
      protein: null,
      carbs: null,
      fat: null,
    });
  });
});
