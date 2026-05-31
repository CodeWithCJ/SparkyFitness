import { deriveSavedAiUnits } from '@/utils/foodAiUnits';
import type { FoodVariant } from '@/types/food';

const createVariant = (overrides: Partial<FoodVariant> = {}): FoodVariant => ({
  id: 'variant-1',
  serving_size: 1,
  serving_unit: 'g',
  calories: 100,
  protein: 10,
  carbs: 20,
  fat: 5,
  saturated_fat: 0,
  polyunsaturated_fat: 0,
  monounsaturated_fat: 0,
  trans_fat: 0,
  cholesterol: 0,
  sodium: 0,
  potassium: 0,
  dietary_fiber: 0,
  sugars: 0,
  vitamin_a: 0,
  vitamin_c: 0,
  calcium: 0,
  iron: 0,
  custom_nutrients: {},
  ...overrides,
});

describe('deriveSavedAiUnits', () => {
  it('keeps a saved AI sparkle for persisted AI units', () => {
    const loadedVariants = [
      createVariant({
        id: 'variant-cup-ai',
        serving_unit: 'cup',
        source: 'ai_estimate',
        ai_confidence: 'medium',
      }),
    ];
    const currentVariants = [
      createVariant({
        id: 'variant-cup-ai',
        serving_unit: 'tsp',
        source: 'ai_estimate',
        ai_confidence: 'medium',
      }),
    ];

    expect(
      deriveSavedAiUnits(loadedVariants, currentVariants, ['cup'])
    ).toEqual([{ unit: 'cup', confidence: 'medium' }]);
  });

  it('drops the saved AI sparkle once the same row is manually overwritten', () => {
    const loadedVariants = [
      createVariant({
        id: 'variant-cup-ai',
        serving_unit: 'cup',
        source: 'ai_estimate',
        ai_confidence: 'medium',
      }),
    ];
    const currentVariants = [
      createVariant({
        id: 'variant-cup-ai',
        serving_unit: 'tsp',
        source: 'manual',
        ai_confidence: null,
      }),
    ];

    expect(deriveSavedAiUnits(loadedVariants, currentVariants, [null])).toEqual(
      []
    );
  });
});
