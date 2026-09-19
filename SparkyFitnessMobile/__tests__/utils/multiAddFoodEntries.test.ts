import type { FoodItem } from '../../src/types/foods';
import {
  MULTI_ADD_MAX_ITEMS,
  convertDraftToPayload,
  multiAddKeyForFood,
  partitionDrafts,
} from '../../src/utils/multiAddFoodEntries';

function makeFood(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: 'food-1',
    name: 'Greek Yogurt',
    brand: 'Fage',
    is_custom: false,
    default_variant: {
      id: 'variant-1',
      serving_size: 170,
      serving_unit: 'g',
      calories: 100,
      protein: 18,
      carbs: 6,
      fat: 0.7,
      sodium: 65,
    },
    ...overrides,
  } as FoodItem;
}

function makeDraft(
  overrides: Partial<Parameters<typeof convertDraftToPayload>[0]> = {}
) {
  return {
    food: makeFood(),
    quantityText: '1',
    mealTypeId: 'meal-type-1',
    entryDate: '2026-09-16',
    ...overrides,
  };
}

describe('multiAddKeyForFood', () => {
  test('keys on food id and default variant id', () => {
    expect(multiAddKeyForFood(makeFood())).toBe('food-1:variant-1');
  });

  test('same food across sections collapses to one key', () => {
    const recent = makeFood();
    const favorite = makeFood();
    expect(multiAddKeyForFood(recent)).toBe(multiAddKeyForFood(favorite));
  });

  test('different variants of the same food stay distinct', () => {
    const grams = makeFood();
    const ounces = makeFood({
      default_variant: {
        id: 'variant-2',
        serving_size: 6,
        serving_unit: 'oz',
        calories: 100,
        protein: 18,
        carbs: 6,
        fat: 0.7,
      },
    });
    expect(multiAddKeyForFood(grams)).not.toBe(multiAddKeyForFood(ounces));
  });

  test('food without variant id falls back to the snapshot key', () => {
    const food = makeFood({
      default_variant: {
        id: undefined,
        serving_size: 1,
        serving_unit: 'serving',
        calories: 10,
        protein: 1,
        carbs: 1,
        fat: 1,
      },
    });
    expect(multiAddKeyForFood(food)).toBe('food-1:snapshot');
  });
});

describe('convertDraftToPayload', () => {
  test('builds a linked entry when food id and variant id exist', () => {
    const conversion = convertDraftToPayload(makeDraft({ quantityText: '2' }));

    expect(conversion.status).toBe('ok');
    if (conversion.status !== 'ok') return;
    expect(conversion.payload).toEqual({
      meal_type_id: 'meal-type-1',
      quantity: 2,
      unit: 'g',
      entry_date: '2026-09-16',
      entry_time: null,
      notes: null,
      food_id: 'food-1',
      variant_id: 'variant-1',
    });
  });

  test('accepts locale decimal input ("1,5" and "1.5")', () => {
    const eu = convertDraftToPayload(makeDraft({ quantityText: '1,5' }));
    const us = convertDraftToPayload(makeDraft({ quantityText: '1.5' }));

    expect(eu.status === 'ok' && eu.payload.quantity).toBe(1.5);
    expect(us.status === 'ok' && us.payload.quantity).toBe(1.5);
  });

  test('accepts thousands separators when unambiguous', () => {
    const us = convertDraftToPayload(makeDraft({ quantityText: '1,000.5' }));
    const eu = convertDraftToPayload(makeDraft({ quantityText: '1.000,5' }));

    expect(us.status === 'ok' && us.payload.quantity).toBe(1000.5);
    expect(eu.status === 'ok' && eu.payload.quantity).toBe(1000.5);
  });

  test('a chosen variant overrides the default in the linked payload', () => {
    const conversion = convertDraftToPayload(
      makeDraft({
        variant: {
          id: 'variant-cup',
          serving_size: 1,
          serving_unit: 'cup',
          calories: 150,
          protein: 8,
          carbs: 30,
          fat: 3,
        },
        quantityText: '2',
      })
    );

    expect(conversion.status).toBe('ok');
    if (conversion.status !== 'ok') return;
    expect(conversion.payload.variant_id).toBe('variant-cup');
    expect(conversion.payload.unit).toBe('cup');
    expect(conversion.payload.quantity).toBe(2);
    expect(conversion.payload.food_id).toBe('food-1');
  });

  test('falls back to a standalone snapshot when the variant has no id', () => {
    const food = makeFood({
      default_variant: {
        id: undefined,
        serving_size: 170,
        serving_unit: 'g',
        calories: 100,
        protein: 18,
        carbs: 6,
        fat: 0.7,
        sodium: 65,
        iron: 0.1,
      },
    });
    const conversion = convertDraftToPayload(
      makeDraft({ food, quantityText: '1' })
    );

    expect(conversion.status).toBe('ok');
    if (conversion.status !== 'ok') return;
    expect(conversion.payload.food_id).toBeUndefined();
    expect(conversion.payload.variant_id).toBeUndefined();
    expect(conversion.payload.food_name).toBe('Greek Yogurt');
    expect(conversion.payload.brand_name).toBe('Fage');
    expect(conversion.payload.serving_size).toBe(170);
    expect(conversion.payload.calories).toBe(100);
    expect(conversion.payload.sodium).toBe(65);
    expect(conversion.payload.iron).toBe(0.1);
  });

  test('omits nutrition the variant does not define', () => {
    const food = makeFood();
    const conversion = convertDraftToPayload(makeDraft({ food }));
    if (conversion.status !== 'ok') throw new Error('expected ok');
    // Not in OPTIONAL keys unless defined; makeFood only defines sodium.
    expect('iron' in conversion.payload).toBe(false);
  });

  test.each(['', '   ', 'abc', '0', '-1', '1..5', '1,2,3'])(
    'rejects invalid quantity %p',
    (quantityText) => {
      const conversion = convertDraftToPayload(makeDraft({ quantityText }));
      expect(conversion).toEqual({
        status: 'invalid',
        key: 'food-1:variant-1',
        reason: 'quantity',
      });
    }
  );
});

describe('partitionDrafts', () => {
  test('splits valid and invalid drafts while preserving keys', () => {
    const good = makeDraft();
    const bad = makeDraft({ quantityText: 'nope' });
    const result = partitionDrafts([good, bad]);

    expect(result.ok).toHaveLength(1);
    expect(result.ok[0].key).toBe('food-1:variant-1');
    expect(result.ok[0].payload.quantity).toBe(1);
    expect(result.invalid).toEqual([
      { key: 'food-1:variant-1', reason: 'quantity' },
    ]);
  });
});

describe('MULTI_ADD_MAX_ITEMS', () => {
  test('caps batches at the documented limit', () => {
    expect(MULTI_ADD_MAX_ITEMS).toBe(50);
  });
});
