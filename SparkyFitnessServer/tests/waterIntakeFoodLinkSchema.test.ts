import { describe, expect, it } from 'vitest';
import {
  waterIntakeEntriesSchema,
  waterIntakeEntriesInitializerSchema,
  waterIntakeEntriesMutatorSchema,
  foodVariantsInitializerSchema,
  foodVariantsMutatorSchema,
  foodEntriesSchema,
  foodEntriesInitializerSchema,
  foodEntriesMutatorSchema,
  mealFoodsInitializerSchema,
} from '@workspace/shared';

// Phase 3 (#1557/#2115 prep): water_ml lands on food_variants, food_entries and
// meal_foods (the three nutrition-snapshot tables); food_entry_id lands on
// water_intake_entries, reserved with no writer until the container->food
// link ships. Both must round-trip through their zod schemas or a valid DB
// row would fail to parse.

const baseWaterIntakeEntry = {
  id: 'entry-1',
  user_id: 'user-1',
  entry_date: new Date('2026-09-05'),
  water_ml: 250,
  container_id: null,
  container_name: null,
  source: 'manual',
  source_id: null,
  created_at: new Date(),
  created_by_user_id: null,
  logged_at: new Date(),
  hydration_factor: null,
};

describe('waterIntakeEntriesSchema — food_entry_id', () => {
  it('accepts a null food_entry_id (the default, always-NULL state until #2115 ships)', () => {
    const result = waterIntakeEntriesSchema.safeParse({
      ...baseWaterIntakeEntry,
      food_entry_id: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a uuid string food_entry_id', () => {
    const result = waterIntakeEntriesSchema.safeParse({
      ...baseWaterIntakeEntry,
      food_entry_id: '9f3a1c2e-1234-4abc-9def-0123456789ab',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.food_entry_id).toBe(
        '9f3a1c2e-1234-4abc-9def-0123456789ab'
      );
    }
  });

  it('rejects a row missing food_entry_id entirely on the base schema (required, nullable)', () => {
    const { food_entry_id: _omit, ...withoutField } = {
      ...baseWaterIntakeEntry,
      food_entry_id: null,
    };
    const result = waterIntakeEntriesSchema.safeParse(withoutField);
    expect(result.success).toBe(false);
  });

  it('the initializer schema allows food_entry_id to be omitted entirely', () => {
    const result = waterIntakeEntriesInitializerSchema.safeParse({
      user_id: 'user-1',
      water_ml: 250,
    });
    expect(result.success).toBe(true);
  });

  it('the mutator schema allows food_entry_id to be omitted entirely', () => {
    const result = waterIntakeEntriesMutatorSchema.safeParse({
      water_ml: 100,
    });
    expect(result.success).toBe(true);
  });
});

describe('water_ml round-trips through all three schema variants of each table', () => {
  it('foodVariantsSchema (initializer, mutator)', () => {
    // The base foodVariantsSchema brands `id` as an intersection type
    // (z.string().and(z.object({__brand: ...}))) that only a real DB round
    // trip satisfies at runtime -- not something hand-built test data can
    // construct. The initializer/mutator schemas (what the app actually
    // parses request bodies against) make id optional, so they cover the
    // water_ml behavior without fighting that brand.
    expect(
      foodVariantsInitializerSchema.safeParse({
        food_id: 'food-1',
        water_ml: 90,
      }).success
    ).toBe(true);
    expect(foodVariantsMutatorSchema.safeParse({ water_ml: 90 }).success).toBe(
      true
    );
    // Nullable: "unknown" is a valid state.
    expect(
      foodVariantsMutatorSchema.safeParse({ water_ml: null }).success
    ).toBe(true);
  });

  it('foodEntriesSchema (base, initializer, mutator)', () => {
    const baseEntry = {
      id: 'entry-1',
      user_id: 'user-1',
      food_id: 'food-1',
      quantity: 1,
      unit: 'g',
      entry_date: new Date(),
      entry_time: null,
      created_at: new Date(),
      variant_id: 'variant-1',
      meal_plan_template_id: null,
      created_by_user_id: null,
      food_name: 'Test Food',
      brand_name: null,
      serving_size: 100,
      serving_unit: 'g',
      calories: 50,
      protein: 1,
      carbs: 10,
      fat: 0,
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
      caffeine_mg: 0,
      glycemic_index: null,
      updated_by_user_id: null,
      meal_id: null,
      food_entry_meal_id: null,
      custom_nutrients: null,
      allergens: null,
      traces: null,
      meal_type_id: 'meal-type-1',
      source: null,
      source_id: null,
      images: [],
      notes: null,
    };

    expect(
      foodEntriesSchema.safeParse({ ...baseEntry, water_ml: 240 }).success
    ).toBe(true);
    expect(
      foodEntriesInitializerSchema.safeParse({
        user_id: 'user-1',
        water_ml: 240,
        meal_type_id: 'meal-type-1',
      }).success
    ).toBe(true);
    expect(foodEntriesMutatorSchema.safeParse({ water_ml: 240 }).success).toBe(
      true
    );
  });

  it('mealFoodsInitializerSchema (the DRY snapshot shape shared by all three variants)', () => {
    // Base mealFoodsSchema brands `id` the same way food_variants does (see
    // above); the initializer schema is what request bodies actually parse
    // against and makes id optional.
    const result = mealFoodsInitializerSchema.safeParse({
      meal_id: 'meal-1',
      food_id: 'food-1',
      quantity: 1,
      unit: 'g',
      water_ml: 50,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.water_ml).toBe(50);
    }
  });
});
