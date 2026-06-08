import type { FoodInfoItem } from '../../src/types/foodInfo';
import type { FoodVariantDetail } from '../../src/types/foods';
import type { ExternalFoodVariant } from '../../src/types/externalFoods';
import {
  applyDisplayValuesToFoodInfo,
  buildExternalVariantOptions,
  buildLocalVariantOptions,
  diffSiblingRows,
  foodInfoToDisplayValues,
  formatVariantLabel,
  groupEquivalentVariants,
  nutritionMatches,
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

describe('nutritionMatches', () => {
  test('identical variants match', () => {
    const v = makeLocalVariant({ calories: 100, protein: 10, carbs: 20, fat: 5 });
    expect(nutritionMatches(v, { ...v })).toBe(true);
  });

  test('treats 0, null, and undefined as equivalent', () => {
    const a = makeLocalVariant({ saturated_fat: 0 });
    const b = makeLocalVariant({ saturated_fat: undefined });
    expect(nutritionMatches(a, b)).toBe(true);
  });

  test('detects polyunsaturated_fat mismatch', () => {
    const a = makeLocalVariant({ polyunsaturated_fat: 2 });
    const b = makeLocalVariant({ polyunsaturated_fat: 3 });
    expect(nutritionMatches(a, b)).toBe(false);
  });

  test('detects monounsaturated_fat mismatch', () => {
    const a = makeLocalVariant({ monounsaturated_fat: 1 });
    const b = makeLocalVariant({ monounsaturated_fat: 4 });
    expect(nutritionMatches(a, b)).toBe(false);
  });

  test('detects custom_nutrients mismatch', () => {
    const a = makeLocalVariant({ custom_nutrients: { magnesium: 50 } });
    const b = makeLocalVariant({ custom_nutrients: { magnesium: 60 } });
    expect(nutritionMatches(a, b)).toBe(false);
  });

  test('custom_nutrients with missing key treated as 0', () => {
    const a = makeLocalVariant({ custom_nutrients: { magnesium: 0 } });
    const b = makeLocalVariant({ custom_nutrients: {} });
    expect(nutritionMatches(a, b)).toBe(true);
  });
});

describe('groupEquivalentVariants', () => {
  test('returns empty array for undefined input', () => {
    expect(groupEquivalentVariants(undefined)).toEqual([]);
  });

  test('groups variants with byte-equal nutrition; preserves stable order', () => {
    const base = makeLocalVariant({ id: 'a', serving_size: 100, serving_unit: 'g', calories: 100 });
    const equivOne = makeLocalVariant({ id: 'b', serving_size: 1, serving_unit: 'cup', calories: 100 });
    const equivTwo = makeLocalVariant({ id: 'c', serving_size: 1, serving_unit: 'oz', calories: 100 });

    const groups = groupEquivalentVariants([base, equivOne, equivTwo]);

    expect(groups).toHaveLength(1);
    expect(groups[0].base.id).toBe('a');
    expect(groups[0].equivalents.map((eq) => eq.id)).toEqual(['b', 'c']);
  });

  test('splits into separate groups when nutrition differs', () => {
    const groupA = makeLocalVariant({ id: 'a', calories: 100 });
    const groupB = makeLocalVariant({ id: 'b', calories: 200, serving_unit: 'cup', serving_size: 1 });

    const groups = groupEquivalentVariants([groupA, groupB]);

    expect(groups).toHaveLength(2);
    expect(groups[0].base.id).toBe('a');
    expect(groups[1].base.id).toBe('b');
  });
});

describe('diffSiblingRows', () => {
  test('active-row-is-base — sibling edits classified correctly', () => {
    const base = makeLocalVariant({ id: 'a', serving_unit: 'g', serving_size: 100, calories: 100 });
    const sibling = makeLocalVariant({ id: 'b', serving_unit: 'cup', serving_size: 1, calories: 100 });
    const current = [base, sibling];

    const desired = [
      // Active is base, byte-equal — should NOT appear in updates
      { ...base },
      // Sibling — serving_size changed → update
      { ...sibling, serving_size: 2 },
      // New equivalent — create
      { food_id: 'food-1', serving_size: 1, serving_unit: 'oz', calories: 100, protein: 0.3, carbs: 14, fat: 0.2 },
    ];

    const { creates, updates, deletes } = diffSiblingRows(current, desired);

    expect(updates.map((u) => u.id)).toEqual(['b']);
    expect(updates[0].serving_size).toBe(2);
    expect(creates).toHaveLength(1);
    expect(creates[0].serving_unit).toBe('oz');
    expect(deletes).toEqual([]);
  });

  test('active-row-is-equivalent — base preserved as desired sibling, not deleted', () => {
    // Regression: active is "cup"; user keeps "g" (base) as an equivalent.
    const base = makeLocalVariant({ id: 'a', serving_unit: 'g', serving_size: 100, calories: 100 });
    const cup = makeLocalVariant({ id: 'b', serving_unit: 'cup', serving_size: 1, calories: 100 });
    const current = [base, cup];

    const desired = [
      // Active is cup
      { ...cup },
      // Base as a sibling — same id, byte-equal → no-op
      { ...base },
    ];

    const { creates, updates, deletes } = diffSiblingRows(current, desired);

    expect(creates).toEqual([]);
    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });

  test('byte-equal updates filtered out', () => {
    const variant = makeLocalVariant({ id: 'a', calories: 100, protein: 10, custom_nutrients: { magnesium: 50 } });
    const { updates } = diffSiblingRows(
      [variant],
      [{ ...variant, custom_nutrients: { magnesium: 50 } }],
    );
    expect(updates).toEqual([]);
  });

  test('pure adds: every desired sibling without id is a create', () => {
    const current: typeof makeLocalVariant extends (...args: any[]) => infer R ? R[] : never = [];
    const { creates, updates, deletes } = diffSiblingRows(current, [
      { food_id: 'food-1', serving_size: 1, serving_unit: 'cup', calories: 100, protein: 0.3, carbs: 14, fat: 0.2 },
      { food_id: 'food-1', serving_size: 1, serving_unit: 'oz', calories: 100, protein: 0.3, carbs: 14, fat: 0.2 },
    ]);
    expect(creates).toHaveLength(2);
    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });

  test('pure deletes: current rows not in desired are deleted', () => {
    const a = makeLocalVariant({ id: 'a' });
    const b = makeLocalVariant({ id: 'b' });
    const { creates, updates, deletes } = diffSiblingRows([a, b], [{ ...a }]);
    expect(creates).toEqual([]);
    expect(updates).toEqual([]);
    expect(deletes).toEqual(['b']);
  });
});
