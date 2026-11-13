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
        .slice(0, 4)
        .map(({ nutrient, previous, proposed }) => ({
          nutrient,
          previous,
          proposed,
        }))
    ).toEqual([
      { nutrient: 'calories', previous: 0, proposed: 600 },
      { nutrient: 'protein', previous: null, proposed: null },
      { nutrient: 'carbs', previous: 12.5, proposed: 90 },
      { nutrient: 'fat', previous: null, proposed: 15 },
    ]);
  });
  it('sums known optional nutrition instead of dropping a nutrient when one ingredient is blank', () => {
    const totals = calculateRecipeNutrition([
      { quantity: 100, unit: 'g', variant: { ...variant, dietary_fiber: ' ' } },
      {
        quantity: 100,
        unit: 'g',
        variant: { ...variant, dietary_fiber: 12.5, sodium: 0 },
      },
    ]);
    expect(totals.dietary_fiber).toBe(12.5);
    expect(totals.sodium).toBe(0);
    expect(totals.calcium).toBeNull();
    expect(nutritionPatch(totals, 2)).toMatchObject({
      fiberContent: '6.25',
      sodiumContent: '0',
    });
  });
  it('writes known unsaturated-fat components without replacing wholly unknown fields with zero', () => {
    expect(
      nutritionPatch({ monounsaturated_fat: 12, polyunsaturated_fat: null }, 4)
    ).toEqual({ unsaturatedFatContent: '3' });
    expect(
      nutritionPatch(
        { monounsaturated_fat: null, polyunsaturated_fat: null },
        4
      )
    ).toEqual({});
  });
  it('shows every supported write, partial value and skipped known nutrient in the same comparison', () => {
    const preview = {
      existingNutrition: { fiberContent: '8', sodiumContent: '7 mg' },
      nutrition: {
        calories: 100,
        dietary_fiber: 6.25,
        sodium: null,
        monounsaturated_fat: 3,
        polyunsaturated_fat: null,
        potassium: 25,
      },
      nutritionCoverage: {
        dietary_fiber: { known: 1, total: 2 },
        monounsaturated_fat: { known: 2, total: 2 },
        polyunsaturated_fat: { known: 0, total: 2 },
      },
    };
    const rows = recipeImportSyncComparison(preview);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nutrient: 'dietary_fiber',
          previous: 8,
          proposed: 6.25,
          status: 'partial',
          known: 1,
          total: 2,
          unit: 'g',
        }),
        expect.objectContaining({
          nutrient: 'sodium',
          proposed: null,
          status: 'skipped',
          reason: 'unknown',
          previousText: '7 mg',
          unit: 'mg',
        }),
        expect.objectContaining({
          nutrient: 'unsaturated_fat',
          proposed: 3,
          status: 'partial',
          known: 2,
          total: 4,
        }),
        expect.objectContaining({
          nutrient: 'potassium',
          proposed: null,
          status: 'skipped',
          reason: 'unsupported',
        }),
      ])
    );
    expect(rows.filter((row) => row.nutrient !== 'potassium')).toHaveLength(11);
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
