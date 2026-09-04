import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  foodPhotoEstimateItemSchema,
  foodPhotoEstimateResponseSchema,
  foodPhotoLogRequestSchema,
  foodPhotoLogResponseSchema,
  FOOD_PHOTO_LOG_MAX_ITEMS,
} from '@workspace/shared';

/** Exactly what the estimator returned before this feature existed. */
const legacyItem = {
  name: 'Grilled chicken thigh',
  estimated_grams: 145,
  portion_description: '1 medium thigh',
  preparation: 'grilled',
  calories_kcal: 289,
  protein_g: 38,
  carbs_g: 0,
  fat_g: 14.5,
  fiber_g: 0,
  sugar_g: 0,
  item_confidence: 'high' as const,
  assumptions: ['assumed skinless'],
};

const legacyResponse = {
  meal_summary: 'Grilled chicken with rice and broccoli',
  overall_confidence: 'medium' as const,
  confidence_reason: 'portion depth not visible',
  items: [legacyItem],
  totals: {
    calories_kcal: 289,
    protein_g: 38,
    carbs_g: 0,
    fat_g: 14.5,
    fiber_g: 0,
    sugar_g: 0,
    total_grams: 145,
  },
  user_weight_reconciliation: '',
  clarifying_questions: [],
};

const validMatch = {
  food_id: '11111111-1111-4111-8111-111111111111',
  variant_id: '22222222-2222-4222-8222-222222222222',
  food_name: 'Chicken Thigh',
  brand: null,
  serving_size: 100,
  serving_unit: 'g',
  match_score: 0.96,
  match_source: 'exact_name' as const,
  is_own_food: true,
  gram_convertible: true,
  scaled: {
    calories_kcal: 288.55,
    protein_g: 37.7,
    carbs_g: 0,
    fat_g: 14.5,
    fiber_g: 0,
    sugar_g: 0,
  },
};

describe('backward compatibility of the estimate contract', () => {
  it('still parses a response that predates every new field', () => {
    expect(
      foodPhotoEstimateResponseSchema.safeParse(legacyResponse).success
    ).toBe(true);
  });

  it('leaves the new item fields undefined rather than defaulting them', () => {
    const item = foodPhotoEstimateItemSchema.parse(legacyItem);
    expect(item.item_id).toBeUndefined();
    expect(item.canonical_name).toBeUndefined();
    expect(item.match).toBeUndefined();
    expect(item.alternates).toBeUndefined();
    expect(item.preselect_match).toBeUndefined();
  });

  it('accepts the enriched item shape the new server sends', () => {
    const parsed = foodPhotoEstimateItemSchema.safeParse({
      ...legacyItem,
      item_id: 'a3f1c2d4-0000-4000-8000-000000000001',
      canonical_name: 'chicken thigh',
      match: validMatch,
      alternates: [
        { ...validMatch, match_score: 0.7, match_source: 'token_overlap' },
      ],
      preselect_match: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('keeps unknown provider fields instead of stripping them', () => {
    const item = foodPhotoEstimateItemSchema.parse({
      ...legacyItem,
      some_future_provider_field: 'kept',
    }) as Record<string, unknown>;
    expect(item.some_future_provider_field).toBe('kept');
  });

  it('allows a null match for an ingredient nothing matched', () => {
    expect(
      foodPhotoEstimateItemSchema.safeParse({ ...legacyItem, match: null })
        .success
    ).toBe(true);
  });

  it('caps alternates so the payload cannot balloon', () => {
    expect(
      foodPhotoEstimateItemSchema.safeParse({
        ...legacyItem,
        alternates: [validMatch, validMatch, validMatch],
      }).success
    ).toBe(false);
  });

  it('rejects a match score outside 0..1', () => {
    expect(
      foodPhotoEstimateItemSchema.safeParse({
        ...legacyItem,
        match: { ...validMatch, match_score: 1.4 },
      }).success
    ).toBe(false);
  });

  it('allows a null scaled block for a non-gram-convertible variant', () => {
    expect(
      foodPhotoEstimateItemSchema.safeParse({
        ...legacyItem,
        match: { ...validMatch, gram_convertible: false, scaled: null },
      }).success
    ).toBe(true);
  });
});

describe('grouped-log request contract', () => {
  const newFood = {
    name: 'Steamed broccoli',
    brand: null,
    serving_size: 100,
    serving_unit: 'g',
    calories: 104.7,
    protein: 3.5,
    carbs: 8.2,
    fat: 1.2,
  };

  const groupedBase = {
    mode: 'grouped' as const,
    entry_date: '2026-08-27',
    entry_time: null,
    meal_type: 'lunch',
    meal_type_id: null,
    name: 'Grilled chicken with rice and broccoli',
    description: null,
    items: [
      {
        source: 'existing' as const,
        food_id: '11111111-1111-4111-8111-111111111111',
        variant_id: '22222222-2222-4222-8222-222222222222',
        quantity: 145,
        unit: 'g',
      },
      { source: 'new' as const, food: newFood, quantity: 85, unit: 'g' },
    ],
  };

  it('accepts a mixed matched/new grouped payload', () => {
    expect(foodPhotoLogRequestSchema.safeParse(groupedBase).success).toBe(true);
  });

  it('rejects a non-day entry_date', () => {
    expect(
      foodPhotoLogRequestSchema.safeParse({
        ...groupedBase,
        entry_date: '2026-08-27T00:00:00Z',
      }).success
    ).toBe(false);
  });

  it('requires at least one item', () => {
    expect(
      foodPhotoLogRequestSchema.safeParse({ ...groupedBase, items: [] }).success
    ).toBe(false);
  });

  it(`caps items at ${FOOD_PHOTO_LOG_MAX_ITEMS}`, () => {
    const tooMany = Array.from(
      { length: FOOD_PHOTO_LOG_MAX_ITEMS + 1 },
      () => ({
        source: 'new' as const,
        food: newFood,
        quantity: 10,
        unit: 'g',
      })
    );
    expect(
      foodPhotoLogRequestSchema.safeParse({ ...groupedBase, items: tooMany })
        .success
    ).toBe(false);
  });

  it('rejects a non-positive quantity', () => {
    expect(
      foodPhotoLogRequestSchema.safeParse({
        ...groupedBase,
        items: [{ source: 'new', food: newFood, quantity: 0, unit: 'g' }],
      }).success
    ).toBe(false);
  });

  it('rejects negative nutrition on a new food', () => {
    expect(
      foodPhotoLogRequestSchema.safeParse({
        ...groupedBase,
        items: [
          {
            source: 'new',
            food: { ...newFood, calories: -1 },
            quantity: 85,
            unit: 'g',
          },
        ],
      }).success
    ).toBe(false);
  });

  it('refuses client-supplied library-hygiene flags', () => {
    // A client must not be able to make a photo food visible in the library.
    expect(
      foodPhotoLogRequestSchema.safeParse({
        ...groupedBase,
        items: [
          {
            source: 'new',
            food: { ...newFood, is_quick_food: false, provider_type: 'manual' },
            quantity: 85,
            unit: 'g',
          },
        ],
      }).success
    ).toBe(false);
  });

  it('rejects an existing item missing its variant_id', () => {
    expect(
      foodPhotoLogRequestSchema.safeParse({
        ...groupedBase,
        items: [
          {
            source: 'existing',
            food_id: '11111111-1111-4111-8111-111111111111',
            quantity: 145,
            unit: 'g',
          },
        ],
      }).success
    ).toBe(false);
  });

  it('defaults nullable optionals so the service never sees undefined', () => {
    const parsed = foodPhotoLogRequestSchema.parse({
      mode: 'grouped',
      entry_date: '2026-08-27',
      meal_type: 'lunch',
      name: 'Plate',
      items: [{ source: 'new', food: newFood, quantity: 85, unit: 'g' }],
    });
    expect(parsed.entry_time).toBeNull();
    expect(parsed.meal_type_id).toBeNull();
    expect(parsed.description).toBeNull();
    expect(
      parsed.items[0].source === 'new' && parsed.items[0].food.brand
    ).toBeNull();
  });
});

describe('combined mode guard', () => {
  const newFood = {
    name: 'Grilled chicken with rice and broccoli',
    brand: null,
    serving_size: 100,
    serving_unit: 'g',
    calories: 149.3,
    protein: 11,
    carbs: 14.1,
    fat: 3.9,
  };
  const combinedBase = {
    mode: 'combined' as const,
    entry_date: '2026-08-27',
    meal_type: 'lunch',
    name: 'Grilled chicken with rice and broccoli',
    items: [
      { source: 'new' as const, food: newFood, quantity: 410, unit: 'g' },
    ],
  };

  it('accepts exactly one new-food item', () => {
    expect(foodPhotoLogRequestSchema.safeParse(combinedBase).success).toBe(
      true
    );
  });

  it('rejects more than one item so rows cannot be silently dropped', () => {
    const r = foodPhotoLogRequestSchema.safeParse({
      ...combinedBase,
      items: [combinedBase.items[0], combinedBase.items[0]],
    });
    expect(r.success).toBe(false);
    expect(
      r.error?.issues.some((i) => i.message.includes('exactly one item'))
    ).toBe(true);
  });

  it('rejects an existing-food item in combined mode', () => {
    expect(
      foodPhotoLogRequestSchema.safeParse({
        ...combinedBase,
        items: [
          {
            source: 'existing',
            food_id: '11111111-1111-4111-8111-111111111111',
            variant_id: '22222222-2222-4222-8222-222222222222',
            quantity: 410,
            unit: 'g',
          },
        ],
      }).success
    ).toBe(false);
  });
});

describe('grouped-log response contract', () => {
  it('accepts a grouped result', () => {
    expect(
      foodPhotoLogResponseSchema.safeParse({
        mode: 'grouped',
        food_entry_meal_id: '33333333-3333-4333-8333-333333333333',
        food_entry_ids: ['44444444-4444-4444-8444-444444444444'],
        created_food_ids: ['55555555-5555-4555-8555-555555555555'],
      }).success
    ).toBe(true);
  });

  it('accepts a combined result with no parent meal', () => {
    expect(
      foodPhotoLogResponseSchema.safeParse({
        mode: 'combined',
        food_entry_meal_id: null,
        food_entry_ids: ['44444444-4444-4444-8444-444444444444'],
        created_food_ids: ['55555555-5555-4555-8555-555555555555'],
      }).success
    ).toBe(true);
  });
});

describe('provider JSON schema stays internally consistent', () => {
  // The Gemini-shaped RESPONSE_SCHEMA carries the same field list three times:
  // `properties`, `required`, and `propertyOrdering`. Gemini reads
  // propertyOrdering, OpenAI/Anthropic strict mode reads required, and every
  // provider reads properties — so a field added to one list and forgotten in
  // another degrades silently on some providers and not others. Pin them.
  // The server package is ESM ("type": "module"), so `__dirname` exists only
  // through Vitest's CJS interop and would break under plain node.
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    resolve(here, '../services/foodPhotoEstimationService.ts'),
    'utf8'
  );

  function listAfter(marker: string, from: number): string[] {
    const start = source.indexOf(marker, from);
    expect(start, `missing ${marker}`).toBeGreaterThan(-1);
    const end = source.indexOf(']', start);
    return [...source.slice(start, end).matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1]
    );
  }

  it('lists identical item fields in properties, required, and propertyOrdering', () => {
    const itemsBlock = source.indexOf('items: {');
    const required = listAfter('required: [', itemsBlock);
    const ordering = listAfter('propertyOrdering: [', itemsBlock);

    expect(required).toEqual(ordering);
    expect(required).toContain('canonical_name');

    for (const field of required) {
      expect(source, `${field} missing from properties`).toContain(
        `${field}: {`
      );
    }
  });

  it('asks the model for canonical_name in the prompt, not just the schema', () => {
    expect(source).toMatch(/canonical_name as well as its display name/);
  });
});
