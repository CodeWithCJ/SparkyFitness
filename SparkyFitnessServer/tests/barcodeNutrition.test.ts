import { describe, expect, it } from 'vitest';
import {
  barcodeNutritionPreview,
  NormalizedFoodSchema,
  type NormalizedFood,
} from '@workspace/shared';
import { mapOpenFoodFactsProduct } from '../integrations/openfoodfacts/openFoodFactsService.js';
import { normalizeFoodForResponse } from '../services/foodProviderDetailService.js';
const makeFood = (unit: string, size: number): NormalizedFood => ({
  name: 'Food',
  brand: null,
  is_custom: false,
  default_variant: {
    serving_size: size,
    serving_unit: unit,
    calories: 150,
    protein: 3,
    carbs: 10,
    fat: 8,
    is_default: true,
  },
});
describe('barcode nutrition comparison', () => {
  it('keeps absent OFF nutrients unknown through the real mapper and API schema', () => {
    const mapped = mapOpenFoodFactsProduct({
      code: '3017620422003',
      product_name: 'No label',
      nutriments: {},
    });
    const normalized = NormalizedFoodSchema.parse(
      normalizeFoodForResponse(mapped)
    );
    expect(barcodeNutritionPreview(normalized)).toMatchObject({
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
    });
  });
  it('distinguishes reported OFF zero from an absent nutrient', () => {
    const mapped = mapOpenFoodFactsProduct({
      code: '3017620422003',
      product_name: 'Zero label',
      nutriments: {
        'energy-kcal_100g': 0,
        proteins_100g: 0,
        carbohydrates_100g: 0,
        fat_100g: 0,
      },
    });
    const normalized = NormalizedFoodSchema.parse(
      normalizeFoodForResponse(mapped)
    );
    expect(barcodeNutritionPreview(normalized)).toMatchObject({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
  it('scales a mass serving to 100 g', () => {
    expect(barcodeNutritionPreview(makeFood('g', 50))).toEqual({
      servingSize: 100,
      servingUnit: 'g',
      calories: 300,
      protein: 6,
      carbs: 20,
      fat: 16,
    });
  });
  it('scales litres to 100 ml without assuming density', () => {
    const preview = barcodeNutritionPreview(makeFood('l', 0.5));
    expect(preview.servingUnit).toBe('ml');
    expect(preview.calories).toBe(30);
  });
  it('keeps an unknown portion unit and its own nutrition', () => {
    expect(barcodeNutritionPreview(makeFood('slice', 2))).toMatchObject({
      servingSize: 2,
      servingUnit: 'slice',
      calories: 150,
    });
  });
  it('uses an available metric variant before an incomparable named portion', () => {
    const food = makeFood('portion', 1);
    food.variants = [
      {
        ...food.default_variant,
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
      },
    ];
    expect(barcodeNutritionPreview(food)).toMatchObject({
      servingSize: 100,
      servingUnit: 'g',
      calories: 200,
    });
  });
  it('does not turn missing or non-finite nutrient data into zero', () => {
    const food = makeFood('g', 100);
    food.default_variant.calories = Number.NaN;
    expect(barcodeNutritionPreview(food).calories).toBeNull();
  });
});
