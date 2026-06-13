import { describe, it, expect, vi, beforeEach } from 'vitest';
import foodRepository from '../models/foodRepository.js';
import measurementService from '../services/measurementService.js';

// Mirror the mock set used by measurementService.healthDataUnits.test.ts (the
// proven harness for processHealthData) and add foodRepository, which the new
// Nutrition ingestion path depends on.
vi.mock('../models/measurementRepository');
vi.mock('../models/userRepository');
vi.mock('../models/exerciseRepository');
vi.mock('../models/exerciseEntry');
vi.mock('../models/sleepRepository');
vi.mock('../models/waterContainerRepository');
vi.mock('../models/activityDetailsRepository');
// Avoid a real DB lookup for the user's timezone (keeps processHealthData
// deterministic and prevents a leaked DB-pool rejection after the test ends).
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
// foodRepository's default export is assembled via runtime spreads, so
// auto-mock can't introspect it — provide an explicit factory mirroring the
// helpers the Health Connect nutrition path uses (the same ones the Garmin
// nutrition sync relies on).
vi.mock('../models/foodRepository', () => ({
  default: {
    findFoodByProviderExternalId: vi.fn(),
    updateFoodVariantNutrition: vi.fn(),
    createFood: vi.fn(),
    createFoodEntry: vi.fn(),
  },
}));

describe('processHealthData Nutrition ingestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sensible defaults so no awaited mock resolves to undefined; individual
    // tests override as needed. Default: no existing food (create path).
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue(
      null
    );
    (foodRepository.updateFoodVariantNutrition as any).mockResolvedValue(
      undefined
    );
    (foodRepository.createFood as any).mockResolvedValue({
      id: 'food-default',
      default_variant_id: 'variant-default',
    });
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-default',
    });
  });

  const baseRecord = {
    type: 'Nutrition',
    source: 'health_connect',
    source_id: 'hc-1',
    timestamp: '2024-01-15T12:30:00.000Z',
    food_name: 'Protein Strawberry pack',
    meal_type: 'lunch',
    // Server stores values as received; the mobile transformer already converted
    // them to Sparky's per-column units (g for macros, mg/mcg for micros).
    calories: 142,
    protein: 20,
    carbs: 11.2,
    fat: 1.2,
    saturated_fat: 0.8,
    sodium: 220,
    sugars: 10.6,
  };

  it('creates a provider food + entry when no food matches by external id', async () => {
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue(
      null
    );
    (foodRepository.createFood as any).mockResolvedValue({
      id: 'food-1',
      default_variant_id: 'variant-1',
    });
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-1',
    });

    const result = await measurementService.processHealthData(
      [baseRecord],
      'user-1',
      'user-1'
    );

    expect(result).toBeDefined();
    // The food is tagged with the Health Connect provider so it is reused by
    // external id next time (and never matches a user-authored library food).
    expect(foodRepository.createFood).toHaveBeenCalledTimes(1);
    expect(foodRepository.updateFoodVariantNutrition).not.toHaveBeenCalled();
    const createFoodArg = (foodRepository.createFood as any).mock.calls[0][0];
    expect(createFoodArg).toMatchObject({
      name: 'Protein Strawberry pack',
      user_id: 'user-1',
      provider_type: 'health_connect',
      // Named record → reused by name.
      provider_external_id: 'Protein Strawberry pack',
      // Hidden from food search.
      is_quick_food: true,
      // food_variants.source is constrained to manual|ai_estimate|imported.
      source: 'imported',
      serving_size: 1,
    });

    // The entry references the new food/variant, carries the source key for
    // idempotent upsert, and snapshots the consumed nutrients directly.
    expect(foodRepository.createFoodEntry).toHaveBeenCalledTimes(1);
    const [entryData, actingUserId] = (foodRepository.createFoodEntry as any)
      .mock.calls[0];
    expect(entryData).toMatchObject({
      user_id: 'user-1',
      food_id: 'food-1',
      variant_id: 'variant-1',
      meal_type: 'lunch',
      entry_date: '2024-01-15',
      source: 'health_connect',
      source_id: 'hc-1',
      calories: 142,
      protein: 20,
      sodium: 220,
    });
    expect(actingUserId).toBe('user-1');
  });

  it('reuses an existing provider food and refreshes its variant nutrition', async () => {
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue({
      id: 'food-existing',
      default_variant_id: 'variant-existing',
    });
    (foodRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-2',
    });

    await measurementService.processHealthData(
      [baseRecord],
      'user-1',
      'user-1'
    );

    // No new food; the existing variant is refreshed to the latest values.
    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(foodRepository.updateFoodVariantNutrition).toHaveBeenCalledTimes(1);
    const [variantId, , nutrition] = (
      foodRepository.updateFoodVariantNutrition as any
    ).mock.calls[0];
    expect(variantId).toBe('variant-existing');
    expect(nutrition).toMatchObject({
      calories: 142,
      protein: 20,
      sodium: 220,
    });

    const entryData = (foodRepository.createFoodEntry as any).mock.calls[0][0];
    expect(entryData).toMatchObject({
      food_id: 'food-existing',
      variant_id: 'variant-existing',
      source_id: 'hc-1',
    });
  });

  it('snapshots consumed nutrients onto the entry so equal-named records do not collapse', async () => {
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue({
      id: 'food-banana',
      default_variant_id: 'variant-banana',
    });

    // Two "Banana" records with different consumed amounts in one batch.
    await measurementService.processHealthData(
      [
        {
          ...baseRecord,
          food_name: 'Banana',
          source_id: 'hc-a',
          calories: 105,
        },
        { ...baseRecord, food_name: 'Banana', source_id: 'hc-b', calories: 60 },
      ],
      'user-1',
      'user-1'
    );

    // Each entry carries its own calories — they are not flattened to one value.
    const calls = (foodRepository.createFoodEntry as any).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toMatchObject({ source_id: 'hc-a', calories: 105 });
    expect(calls[1][0]).toMatchObject({ source_id: 'hc-b', calories: 60 });
  });

  it('gives each nameless record its own food keyed by source_id (no collapse)', async () => {
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue(
      null
    );

    // Two records with no name but distinct ids.
    await measurementService.processHealthData(
      [
        { ...baseRecord, food_name: '   ', source_id: 'hc-x', calories: 105 },
        {
          ...baseRecord,
          food_name: undefined,
          source_id: 'hc-y',
          calories: 60,
        },
      ],
      'user-1',
      'user-1'
    );

    // Each is looked up + created under its own source_id, not a shared
    // 'Health Connect food' row, and both are hidden quick foods.
    const createCalls = (foodRepository.createFood as any).mock.calls;
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0][0]).toMatchObject({
      name: 'Health Connect food',
      provider_external_id: 'hc-x',
      is_quick_food: true,
    });
    expect(createCalls[1][0]).toMatchObject({
      name: 'Health Connect food',
      provider_external_id: 'hc-y',
      is_quick_food: true,
    });
    const lookups = (foodRepository.findFoodByProviderExternalId as any).mock
      .calls;
    expect(lookups[0][1]).toBe('hc-x');
    expect(lookups[1][1]).toBe('hc-y');
  });

  it('skips a Nutrition record with no source_id (cannot dedupe → would duplicate)', async () => {
    await measurementService.processHealthData(
      [{ ...baseRecord, source_id: undefined }],
      'user-1',
      'user-1'
    );

    expect(foodRepository.findFoodByProviderExternalId).not.toHaveBeenCalled();
    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(foodRepository.createFoodEntry).not.toHaveBeenCalled();
  });

  it('does not touch foods when there are no nutrition records', async () => {
    await measurementService.processHealthData(
      [{ type: 'weight', value: 70, date: '2024-01-15' }],
      'user-1',
      'user-1'
    );

    expect(foodRepository.findFoodByProviderExternalId).not.toHaveBeenCalled();
    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(foodRepository.createFoodEntry).not.toHaveBeenCalled();
  });
});
