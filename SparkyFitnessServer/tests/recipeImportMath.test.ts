import { describe, expect, it } from 'vitest';
import {
  calculateRecipeNutrition,
  mealServingFields,
  sourceAmountMatches,
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
  it('recognizes equivalent source amounts but refuses guesses and missing quantities', () => {
    expect(sourceAmountMatches(1, 'kg', 1000, 'g')).toBe(true);
    expect(sourceAmountMatches(1, 'cup', 200, 'g')).toBe(false);
    expect(sourceAmountMatches(null, 'g', 100, 'g')).toBe(false);
    expect(sourceAmountMatches(100, 'g', 101, 'g')).toBe(false);
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
