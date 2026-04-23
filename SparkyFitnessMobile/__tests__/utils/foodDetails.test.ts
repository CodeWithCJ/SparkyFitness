import type { FoodInfoItem } from '../../src/types/foodInfo';
import type { FoodVariantDetail } from '../../src/types/foods';
import type { ExternalFoodVariant } from '../../src/types/externalFoods';
import {
  applyDisplayValuesToFoodInfo,
  buildExternalVariantOptions,
  buildLocalVariantOptions,
  foodInfoToDisplayValues,
  formatVariantLabel,
  resolveFoodDisplayValues,
} from '../../src/utils/foodDetails';

function makeItem(overrides: Partial<FoodInfoItem> = {}): FoodInfoItem {
  return {
    id: 'food-1',
    name: 'Apple',
    brand: null,
    servingSize: 100,
    servingUnit: 'g',
    calories: 52,
    protein: 0.3,
    carbs: 14,
    fat: 0.2,
    source: 'local',
    // originalItem is only used by form flows; a minimal shape is fine for these pure utils.
    originalItem: {} as unknown as FoodInfoItem['originalItem'],
    ...overrides,
  };
}

function makeLocalVariant(overrides: Partial<FoodVariantDetail> = {}): FoodVariantDetail {
  return {
    id: 'variant-1',
    food_id: 'food-1',
    serving_size: 100,
    serving_unit: 'g',
    calories: 52,
    protein: 0.3,
    carbs: 14,
    fat: 0.2,
    ...overrides,
  };
}

function makeExternalVariant(overrides: Partial<ExternalFoodVariant> = {}): ExternalFoodVariant {
  return {
    serving_size: 1,
    serving_unit: 'piece',
    serving_description: '1 medium apple',
    calories: 95,
    protein: 0.5,
    carbs: 25,
    fat: 0.3,
    ...overrides,
  };
}

describe('formatVariantLabel', () => {
  test('formats as "{size} {unit} ({cal} cal)"', () => {
    expect(formatVariantLabel({ servingSize: 100, servingUnit: 'g', calories: 52 })).toBe(
      '100 g (52 cal)',
    );
  });
});

describe('buildLocalVariantOptions', () => {
  test('returns an empty list when variants is undefined', () => {
    expect(buildLocalVariantOptions(undefined)).toEqual([]);
  });

  test('maps FoodVariantDetail shape (snake_case) to FoodDisplayValues shape (camelCase)', () => {
    const options = buildLocalVariantOptions([
      makeLocalVariant({
        id: 'v-1',
        serving_size: 150,
        serving_unit: 'g',
        calories: 78,
        dietary_fiber: 3.2,
        saturated_fat: 0.1,
        vitamin_a: 8,
        vitamin_c: 6,
      }),
    ]);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      id: 'v-1',
      label: '150 g (78 cal)',
      servingSize: 150,
      servingUnit: 'g',
      calories: 78,
      fiber: 3.2,
      saturatedFat: 0.1,
      vitaminA: 8,
      vitaminC: 6,
    });
  });
});

describe('buildExternalVariantOptions', () => {
  test('returns an empty list when variants is undefined', () => {
    expect(buildExternalVariantOptions(undefined)).toEqual([]);
  });

  test('uses serving_description and assigns ext-{index} ids', () => {
    const options = buildExternalVariantOptions([
      makeExternalVariant({ serving_description: '1 small', calories: 60 }),
      makeExternalVariant({ serving_description: '1 large', calories: 120 }),
    ]);

    expect(options.map((option) => option.id)).toEqual(['ext-0', 'ext-1']);
    expect(options[0].label).toBe('1 small (60 cal)');
    expect(options[1].label).toBe('1 large (120 cal)');
  });
});

describe('resolveFoodDisplayValues', () => {
  const item = makeItem({ calories: 52, servingSize: 100, servingUnit: 'g' });
  const localOptions = buildLocalVariantOptions([
    makeLocalVariant({ id: 'local-1', calories: 150, serving_size: 1, serving_unit: 'cup' }),
  ]);
  const externalOptions = buildExternalVariantOptions([
    makeExternalVariant({ calories: 95, serving_size: 1, serving_unit: 'piece' }),
  ]);

  test('returns the matching local variant when selectedVariantId matches a local option', () => {
    const values = resolveFoodDisplayValues({
      item,
      selectedVariantId: 'local-1',
      localVariantOptions: localOptions,
      externalVariantOptions: externalOptions,
    });

    expect(values.calories).toBe(150);
    expect(values.servingUnit).toBe('cup');
  });

  test('falls back to the external variant when no local variant matches', () => {
    const values = resolveFoodDisplayValues({
      item,
      selectedVariantId: 'ext-0',
      localVariantOptions: localOptions,
      externalVariantOptions: externalOptions,
    });

    expect(values.calories).toBe(95);
    expect(values.servingUnit).toBe('piece');
  });

  test('falls back to the item itself when no variant matches', () => {
    const values = resolveFoodDisplayValues({
      item,
      selectedVariantId: 'does-not-exist',
      localVariantOptions: localOptions,
      externalVariantOptions: externalOptions,
    });

    // Unmatched id falls through to item-derived values, not a local/external variant.
    expect(values.calories).toBe(52);
    expect(values.servingUnit).toBe('g');
  });

  test('falls back to the item itself when selectedVariantId is undefined', () => {
    const values = resolveFoodDisplayValues({
      item,
      localVariantOptions: localOptions,
      externalVariantOptions: externalOptions,
    });

    expect(values).toEqual(foodInfoToDisplayValues(item));
  });

  test('handles absent variant option arrays', () => {
    const values = resolveFoodDisplayValues({
      item,
      selectedVariantId: 'local-1',
    });

    expect(values).toEqual(foodInfoToDisplayValues(item));
  });
});

describe('applyDisplayValuesToFoodInfo', () => {
  test('merges display values onto the item and tags the variantId', () => {
    const item = makeItem({ calories: 52, servingSize: 100, servingUnit: 'g' });
    const merged = applyDisplayValuesToFoodInfo(
      item,
      {
        servingSize: 150,
        servingUnit: 'cup',
        calories: 200,
        protein: 5,
        carbs: 30,
        fat: 2,
        fiber: 3,
      },
      'variant-xyz',
    );

    expect(merged.calories).toBe(200);
    expect(merged.servingSize).toBe(150);
    expect(merged.servingUnit).toBe('cup');
    expect(merged.fiber).toBe(3);
    expect(merged.variantId).toBe('variant-xyz');
    // Untouched fields survive (name, source, etc).
    expect(merged.name).toBe(item.name);
    expect(merged.source).toBe(item.source);
  });
});
