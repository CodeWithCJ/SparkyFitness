import type { FoodInfoItem } from '../../src/types/foodInfo';
import type { FoodVariantDetail } from '../../src/types/foods';
import type { ExternalFoodVariant } from '../../src/types/externalFoods';
import {
  applyDisplayValuesToFoodInfo,
  buildExternalVariantOptions,
  buildLocalVariantOptions,
  convertEquivalentVariantQuantity,
  diffSiblingRows,
  foodInfoToDisplayValues,
  formatVariantLabel,
  groupEquivalentVariants,
  nutritionMatches,
  resolveFoodDisplayValues,
  resolveLocalPickerVariantId,
  formatServingDescription,
  selectDisplayVariant,
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

function makeLocalVariant(
  overrides: Partial<FoodVariantDetail> = {},
): FoodVariantDetail {
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

function makeExternalVariant(
  overrides: Partial<ExternalFoodVariant> = {},
): ExternalFoodVariant {
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

function makeDisplayVariant(
  serving_size: number,
  serving_unit: string,
  serving_description?: string,
) {
  return { serving_size, serving_unit, serving_description };
}

describe('formatServingDescription', () => {
  it('replaces underscores with spaces', () => {
    expect(formatServingDescription('1_stück_(30_g)')).toBe('1 stück (30 g)');
    expect(formatServingDescription('one_cup')).toBe('one cup');
  });

  it('collapses multiple whitespace', () => {
    expect(formatServingDescription('1  Stück   (30 g)')).toBe(
      '1 Stück (30 g)',
    );
  });

  it('trims leading and trailing whitespace', () => {
    expect(formatServingDescription('  foo bar  ')).toBe('foo bar');
  });

  it('returns empty string for empty input', () => {
    expect(formatServingDescription('')).toBe('');
  });

  it('preserves decimals and units', () => {
    expect(formatServingDescription('1.5_cups_(350_ml)')).toBe(
      '1.5 cups (350 ml)',
    );
  });

  it('handles already-clean descriptions', () => {
    expect(formatServingDescription('1 medium apple')).toBe('1 medium apple');
  });

  it('handles values with dots', () => {
    expect(formatServingDescription('1..5_cups')).toBe('1..5 cups');
  });
});

describe('selectDisplayVariant', () => {
  it('returns the default variant when no variants are provided', () => {
    const dv = makeDisplayVariant(100, 'g');
    const result = selectDisplayVariant(dv, undefined);
    expect(result.displayVariant).toBe(dv);
    expect(result.orderedVariants).toBeUndefined();
  });

  it('returns the default variant when it is not a reference serving', () => {
    const dv = makeDisplayVariant(50, 'g');
    const variants = [makeDisplayVariant(50, 'g', 'a small portion')];
    const result = selectDisplayVariant(dv, variants);
    expect(result.displayVariant).toBe(dv);
    expect(result.orderedVariants).toEqual([dv]);
  });

  it('prefers a named serving over a 100g reference serving', () => {
    const dv = makeDisplayVariant(100, 'g');
    const serving = makeDisplayVariant(1, 'Stück', '1 Stück (30 g)');
    const metricEquivalent = makeDisplayVariant(30, 'g');
    const variants = [serving, metricEquivalent];
    const result = selectDisplayVariant(dv, variants);
    expect(result.displayVariant).toBe(serving);
    expect(result.orderedVariants).toEqual([serving, dv, metricEquivalent]);
  });

  it('prefers a named serving over a 100ml reference serving', () => {
    const dv = makeDisplayVariant(100, 'ml');
    const serving = makeDisplayVariant(1, 'cup', '1 cup (250 ml)');
    const metricEquivalent = makeDisplayVariant(250, 'ml');
    const variants = [serving, metricEquivalent];
    const result = selectDisplayVariant(dv, variants);
    expect(result.displayVariant).toBe(serving);
    expect(result.orderedVariants).toEqual([serving, dv, metricEquivalent]);
  });

  it('deduplicates default variant from ordered list', () => {
    const dv = makeDisplayVariant(100, 'g');
    const descriptive = makeDisplayVariant(1, 'Stück', '1 Stück (30 g)');
    const sameAsDv = makeDisplayVariant(100, 'g', 'Reference serving');
    const variants = [descriptive, sameAsDv];
    const result = selectDisplayVariant(dv, variants);
    expect(result.displayVariant).toBe(descriptive);
    expect(result.orderedVariants).toEqual([descriptive, dv]);
  });

  it('deduplicates variants while keeping the serving before the reference', () => {
    const dv = makeDisplayVariant(100, 'g');
    const descriptive = makeDisplayVariant(1, 'Stück', '1 Stück (30 g)');
    const other = makeDisplayVariant(200, 'g', 'double portion');
    const alsoDv = makeDisplayVariant(100, 'g', 'reference copy');
    const alsoDescriptive = makeDisplayVariant(1, 'Stück', '1 Stück copy');
    const variants = [descriptive, other, alsoDv, alsoDescriptive];
    const result = selectDisplayVariant(dv, variants);
    expect(result.displayVariant).toBe(descriptive);
    expect(result.orderedVariants).toEqual([descriptive, dv, other]);
  });

  it('returns default variant when no descriptive variant exists', () => {
    const dv = makeDisplayVariant(100, 'g');
    const another = makeDisplayVariant(50, 'g');
    const variants = [another];
    const result = selectDisplayVariant(dv, variants);
    expect(result.displayVariant).toBe(dv);
    expect(result.orderedVariants).toEqual([dv, another]);
  });

  it('ignores variants without meaningful descriptions', () => {
    const dv = makeDisplayVariant(100, 'g');
    const numericDesc = makeDisplayVariant(50, 'g', '50 g');
    const variants = [numericDesc];
    const result = selectDisplayVariant(dv, variants);
    expect(result.displayVariant).toBe(dv);
  });
});

describe('formatVariantLabel', () => {
  test('formats as "{size} {unit} ({cal} cal)"', () => {
    expect(
      formatVariantLabel({ servingSize: 100, servingUnit: 'g', calories: 52 }),
    ).toBe('100 g (52 cal)');
  });

  test('prefers meaningful serving descriptions with gram weight', () => {
    expect(
      formatVariantLabel({
        servingSize: 1,
        servingUnit: 'piece',
        servingDescription: '1 piece (15 g)',
        calories: 50,
      }),
    ).toBe('1 piece (15 g) (50 cal)');
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

  test('reconstructs local provider portion labels from equivalent metric variants', () => {
    const options = buildLocalVariantOptions([
      makeLocalVariant({
        id: 'v-piece',
        serving_size: 1,
        serving_unit: 'piece',
        calories: 50,
      }),
      makeLocalVariant({
        id: 'v-grams',
        serving_size: 15,
        serving_unit: 'g',
        calories: 50,
      }),
    ]);

    expect(options[0]).toMatchObject({
      id: 'v-piece',
      label: '1 piece (15 g) (50 cal)',
      quantityUnitLabel: 'piece (15 g)',
      servingSize: 1,
      servingUnit: 'piece',
      calories: 50,
    });
    expect(options).toHaveLength(1);
  });

  test('keeps the 100g reference visible when a named provider portion is available', () => {
    const options = buildLocalVariantOptions([
      makeLocalVariant({
        id: 'v-portion',
        serving_size: 1,
        serving_unit: 'portion',
        calories: 180,
      }),
      makeLocalVariant({
        id: 'v-reference',
        serving_size: 100,
        serving_unit: 'g',
        calories: 120,
      }),
      makeLocalVariant({
        id: 'v-portion-grams',
        serving_size: 150,
        serving_unit: 'g',
        calories: 180,
      }),
    ]);

    expect(options).toEqual([
      expect.objectContaining({
        id: 'v-portion',
        label: '1 portion (150 g) (180 cal)',
      }),
      expect.objectContaining({
        id: 'v-reference',
        label: '100 g (120 cal)',
      }),
    ]);
  });

  test('maps a selected hidden metric sibling to its visible named portion', () => {
    const variants = [
      makeLocalVariant({
        id: 'v-portion',
        serving_size: 1,
        serving_unit: 'portion',
        calories: 180,
      }),
      makeLocalVariant({
        id: 'v-portion-grams',
        serving_size: 150,
        serving_unit: 'g',
        calories: 180,
      }),
    ];

    expect(resolveLocalPickerVariantId(variants, 'v-portion-grams')).toBe(
      'v-portion',
    );
  });
});

describe('convertEquivalentVariantQuantity', () => {
  test('keeps consumed servings constant when remapping to a visible equivalent variant', () => {
    expect(convertEquivalentVariantQuantity(2, 1, 150)).toBe(300);
    expect(convertEquivalentVariantQuantity(75, 150, 1)).toBe(0.5);
  });

  test('returns undefined when serving sizes are missing or invalid', () => {
    expect(convertEquivalentVariantQuantity(2, undefined, 150)).toBeUndefined();
    expect(convertEquivalentVariantQuantity(2, 1, 0)).toBeUndefined();
    expect(convertEquivalentVariantQuantity(Number.NaN, 1, 150)).toBeUndefined();
  });
});

describe('buildExternalVariantOptions', () => {
  test('returns an empty list when variants is undefined', () => {
    expect(buildExternalVariantOptions(undefined)).toEqual([]);
  });

  test('uses serving_description and assigns ext-{index} ids', () => {
    const options = buildExternalVariantOptions([
      makeExternalVariant({ serving_description: '1 small', calories: 60 }),
      makeExternalVariant({
        serving_size: 2,
        serving_unit: 'pieces',
        serving_description: '1 large',
        calories: 120,
      }),
    ]);

    expect(options.map(option => option.id)).toEqual(['ext-0', 'ext-1']);
    expect(options[0].label).toBe('1 small (60 cal)');
    expect(options[1].label).toBe('1 large (120 cal)');
  });

  test('groups a provider serving with its metric equivalent', () => {
    const options = buildExternalVariantOptions([
      makeExternalVariant({
        serving_size: 1,
        serving_unit: 'Fruit',
        serving_description: '1 Fruit (4.9 g)',
        calories: 3,
        protein: 0.1,
        carbs: 0.7,
        fat: 0,
      }),
      makeExternalVariant({
        serving_size: 100,
        serving_unit: 'g',
        serving_description: '100 g',
        calories: 61,
        protein: 2,
        carbs: 14,
        fat: 0,
      }),
      makeExternalVariant({
        serving_size: 4.9,
        serving_unit: 'g',
        serving_description: '4.9 g',
        calories: 3,
        protein: 0.1,
        carbs: 0.7,
        fat: 0,
      }),
    ]);

    expect(options.map(option => option.label)).toEqual([
      '1 Fruit (4.9 g) (3 cal)',
      '100 g (61 cal)',
    ]);
    expect(options[0].id).toBe('ext-0');
  });
});

describe('resolveFoodDisplayValues', () => {
  const item = makeItem({ calories: 52, servingSize: 100, servingUnit: 'g' });
  const localOptions = buildLocalVariantOptions([
    makeLocalVariant({
      id: 'local-1',
      calories: 150,
      serving_size: 1,
      serving_unit: 'cup',
    }),
  ]);
  const externalOptions = buildExternalVariantOptions([
    makeExternalVariant({
      calories: 95,
      serving_size: 1,
      serving_unit: 'piece',
    }),
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
    const v = makeLocalVariant({
      calories: 100,
      protein: 10,
      carbs: 20,
      fat: 5,
    });
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

  test('promotes non-reference variant to base when 100g matches first', () => {
    const reference = makeLocalVariant({
      id: 'a',
      serving_size: 100,
      serving_unit: 'g',
      calories: 100,
    });
    const equivOne = makeLocalVariant({
      id: 'b',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 100,
    });
    const equivTwo = makeLocalVariant({
      id: 'c',
      serving_size: 1,
      serving_unit: 'oz',
      calories: 100,
    });

    const groups = groupEquivalentVariants([reference, equivOne, equivTwo]);

    expect(groups).toHaveLength(1);
    // 'b' (cup) becomes base because reference (100g) is a reference serving
    expect(groups[0].base.id).toBe('b');
    expect(groups[0].equivalents.map(eq => eq.id)).toEqual(['a', 'c']);
  });

  test('splits into separate groups when nutrition differs', () => {
    const groupA = makeLocalVariant({ id: 'a', calories: 100 });
    const groupB = makeLocalVariant({
      id: 'b',
      calories: 200,
      serving_unit: 'cup',
      serving_size: 1,
    });

    const groups = groupEquivalentVariants([groupA, groupB]);

    expect(groups).toHaveLength(2);
    expect(groups[0].base.id).toBe('a');
    expect(groups[1].base.id).toBe('b');
  });

  test('groups same-size/unit variants when nutrition differs by rounding', () => {
    const named = makeLocalVariant({
      id: 'named',
      serving_size: 150,
      serving_unit: 'g',
      serving_description: 'portion (150 g)',
      calories: 183,
      protein: 3.4,
      carbs: 41,
      fat: 0,
    });
    const metric = makeLocalVariant({
      id: 'metric',
      serving_size: 150,
      serving_unit: 'g',
      calories: 183,
      protein: 3.3,
      carbs: 41,
      fat: 0,
    });

    const groups = groupEquivalentVariants([named, metric]);

    expect(groups).toHaveLength(1);
    expect(groups[0].base.id).toBe('named');
    expect(groups[0].equivalents.map(eq => eq.id)).toContain('metric');
  });
});

describe('diffSiblingRows', () => {
  test('active-row-is-base — sibling edits classified correctly', () => {
    const base = makeLocalVariant({
      id: 'a',
      serving_unit: 'g',
      serving_size: 100,
      calories: 100,
    });
    const sibling = makeLocalVariant({
      id: 'b',
      serving_unit: 'cup',
      serving_size: 1,
      calories: 100,
    });
    const current = [base, sibling];

    const desired = [
      // Active is base, byte-equal — should NOT appear in updates
      { ...base },
      // Sibling — serving_size changed → update
      { ...sibling, serving_size: 2 },
      // New equivalent — create
      {
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 100,
        protein: 0.3,
        carbs: 14,
        fat: 0.2,
      },
    ];

    const { creates, updates, deletes } = diffSiblingRows(current, desired);

    expect(updates.map(u => u.id)).toEqual(['b']);
    expect(updates[0].serving_size).toBe(2);
    expect(creates).toHaveLength(1);
    expect(creates[0].serving_unit).toBe('oz');
    expect(deletes).toEqual([]);
  });

  test('active-row-is-equivalent — base preserved as desired sibling, not deleted', () => {
    // Regression: active is "cup"; user keeps "g" (base) as an equivalent.
    const base = makeLocalVariant({
      id: 'a',
      serving_unit: 'g',
      serving_size: 100,
      calories: 100,
    });
    const cup = makeLocalVariant({
      id: 'b',
      serving_unit: 'cup',
      serving_size: 1,
      calories: 100,
    });
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
    const variant = makeLocalVariant({
      id: 'a',
      calories: 100,
      protein: 10,
      custom_nutrients: { magnesium: 50 },
    });
    const { updates } = diffSiblingRows(
      [variant],
      [{ ...variant, custom_nutrients: { magnesium: 50 } }],
    );
    expect(updates).toEqual([]);
  });

  test('pure adds: every desired sibling without id is a create', () => {
    const current: typeof makeLocalVariant extends (...args: any[]) => infer R
      ? R[]
      : never = [];
    const { creates, updates, deletes } = diffSiblingRows(current, [
      {
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 100,
        protein: 0.3,
        carbs: 14,
        fat: 0.2,
      },
      {
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 100,
        protein: 0.3,
        carbs: 14,
        fat: 0.2,
      },
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
