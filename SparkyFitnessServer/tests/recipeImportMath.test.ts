import { describe, expect, it } from 'vitest';
import { recipeImportSyncComparison } from '@workspace/shared';
import {
  calculateRecipeNutrition,
  mealServingFields,
  recipeFingerprint,
  selectCandidateIds,
  nutritionPatch,
} from '../services/recipeImportMath.js';
const variant = {
  serving_size: 100,
  serving_unit: 'g',
  calories: 400,
  protein: 10,
  carbs: 60,
  fat: 10,
};
describe('ingredient recipe calculations', () => {
  it('compares Mealie numeric strings and measured zero without turning unknown nutrition into zero', () => {
    expect(
      recipeImportSyncComparison({
        existingNutrition: {
          calories: '0',
          proteinContent: ' ',
          carbohydrateContent: '12.5',
          fatContent: null,
        },
        nutrition: { calories: 600, protein: null, carbs: 90, fat: 15 },
      })
    ).toEqual([
      { nutrient: 'calories', previous: 0, proposed: 600 },
      { nutrient: 'protein', previous: null, proposed: null },
      { nutrient: 'carbs', previous: 12.5, proposed: 90 },
      { nutrient: 'fat', previous: null, proposed: 15 },
    ]);
  });
  it('uses the finished weight only for the cooked portion denominator', () => {
    const totals = calculateRecipeNutrition([
      { quantity: 600, unit: 'g', variant },
    ]);
    expect(totals.calories).toBe(2400);
    const meal = mealServingFields(4, 1800);
    expect(meal).toEqual({
      serving_size: 450,
      serving_unit: 'g',
      total_servings: 4,
    });
    expect(
      (totals.calories! * 450) / (meal.serving_size * meal.total_servings)
    ).toBe(600);
  });
  it('rejects volume to mass and missing/invalid required nutrient inputs', () => {
    expect(() =>
      calculateRecipeNutrition([{ quantity: 1, unit: 'cup', variant }])
    ).toThrow(/unit/i);
    expect(() =>
      calculateRecipeNutrition([{ quantity: 0, unit: 'g', variant }])
    ).toThrow(/quantity/i);
    expect(() =>
      calculateRecipeNutrition([
        { quantity: 100, unit: 'g', variant: { ...variant, protein: null } },
      ])
    ).toThrow(/nutrition/i);
  });
  it('keeps unknown optional nutrients unknown and writes only complete nutrient fields per serving', () => {
    const totals = calculateRecipeNutrition([
      { quantity: 600, unit: 'g', variant },
    ]);
    expect(totals.sodium).toBeNull();
    expect(nutritionPatch(totals, 4)).toEqual({
      calories: '600',
      proteinContent: '15',
      carbohydrateContent: '90',
      fatContent: '15',
    });
  });
  it('keeps blank nutrients unknown while accepting measured zero', () => {
    expect(() =>
      calculateRecipeNutrition([
        { quantity: 100, unit: 'g', variant: { ...variant, protein: '   ' } },
      ])
    ).toThrow(/nutrition/i);
    const totals = calculateRecipeNutrition([
      {
        quantity: 100,
        unit: 'g',
        variant: { ...variant, protein: 0, sodium: '   ' },
      },
    ]);
    expect(totals.protein).toBe(0);
    expect(totals.sodium).toBeNull();
  });
  it('detects remote changes while ignoring object property order', () => {
    expect(recipeFingerprint({ name: 'A', recipeServings: 4 })).toBe(
      recipeFingerprint({ recipeServings: 4, name: 'A' })
    );
    expect(recipeFingerprint({ name: 'A' })).not.toBe(
      recipeFingerprint({ name: 'B' })
    );
  });
  it('accepts only retrieved AI candidate IDs and never changes confirmed mappings', () => {
    expect(
      selectCandidateIds(
        [
          { ingredientId: 'a', candidateId: 'real' },
          { ingredientId: 'b', candidateId: 'invented' },
        ],
        { a: ['real'], b: ['real'] },
        new Set(['a'])
      )
    ).toEqual([]);
    expect(
      selectCandidateIds(
        [{ ingredientId: 'a', candidateId: 'real', calories: 999 }],
        { a: ['real'] },
        new Set()
      )
    ).toEqual([{ ingredientId: 'a', candidateId: 'real' }]);
  });
});
