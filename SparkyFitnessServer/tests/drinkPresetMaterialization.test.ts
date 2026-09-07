import { describe, expect, it, vi, beforeEach } from 'vitest';
import waterContainerService from '../services/waterContainerService.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import foodRepository from '../models/food.js';
import {
  DRINK_PRESET_CATALOG,
  getDrinkPresetCatalogEntry,
} from '@workspace/shared';

vi.mock('../models/waterContainerRepository.js');
vi.mock('../models/food.js');
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

describe('Drink Preset Materialization (#1958, #1925, #2115)', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a complete canonical catalog with required nutrient and hydration fields', () => {
    expect(DRINK_PRESET_CATALOG.length).toBeGreaterThanOrEqual(12);

    const espresso = getDrinkPresetCatalogEntry('espresso');
    expect(espresso).toBeDefined();
    expect(espresso?.volumeMl).toBe(30);
    expect(espresso?.caffeineMg).toBe(63);
    expect(espresso?.hydrationFactor).toBe(0);
    expect(espresso?.kind).toBe('caffeine');

    const beer = getDrinkPresetCatalogEntry('beer_pint');
    expect(beer).toBeDefined();
    expect(beer?.volumeMl).toBe(568);
    expect(beer?.abvPercent).toBe(4.5);
    expect(beer?.alcoholG).toBe(20.2);
    expect(beer?.hydrationFactor).toBe(0.7);
    expect(beer?.kind).toBe('alcohol');
  });

  it('materializes a catalog preset into per-user custom food, variant, and quick-add container', async () => {
    vi.mocked(
      waterContainerRepository.getWaterContainersByUserId
    ).mockResolvedValue([]);

    vi.mocked(foodRepository.createFood).mockResolvedValue({
      id: 'food-espresso-1',
      name: 'Espresso',
      user_id: userId,
      is_custom: true,
      shared_with_public: false,
      default_variant: {
        id: 'var-espresso-1',
        food_id: 'food-espresso-1',
        serving_size: 30,
        serving_unit: 'ml',
        caffeine_mg: 63,
        water_ml: 0,
      },
    } as any);

    vi.mocked(waterContainerRepository.createWaterContainer).mockResolvedValue({
      id: 101,
      user_id: userId,
      name: 'Espresso',
      volume: 0,
      linked_quantity: 1,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
      hydration_factor: 0,
      linked_food_id: 'food-espresso-1',
      linked_variant_id: 'var-espresso-1',
      linked_meal_type_id: null,
      is_quick_add: true,
      sort_order: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await waterContainerService.materializeDrinkPreset(
      userId,
      'espresso'
    );

    expect(foodRepository.createFood).toHaveBeenCalledWith({
      user_id: userId,
      name: 'Espresso',
      is_custom: true,
      shared_with_public: false,
      serving_size: 30,
      serving_unit: 'ml',
      caffeine_mg: 63,
      // Generic energy and macros for the drink as served: a preset that
      // logged a 180 kcal latte as 0 kcal is worse than no preset at all.
      calories: 3,
      protein: 0.1,
      carbs: 0.5,
      fat: 0.1,
      sugars: 0,
      saturated_fat: 0,
      abv_percent: 0,
      alcohol_g: 0,
      water_ml: 0,
    });

    expect(waterContainerRepository.createWaterContainer).toHaveBeenCalledWith(
      userId,
      {
        name: 'Espresso',
        // The preset's 30 ml lives on the variant it just created. On a linked
        // container volume means "the glass holds more than the food", so
        // repeating it here would override the food with its own number.
        volume: 0,
        unit: 'ml',
        is_primary: false,
        servings_per_container: 1,
        // One whole serving in the variant's own unit. Quantity 1 against a
        // 30 ml espresso would log one millilitre of it -- 2 mg of its 63 mg
        // of caffeine -- because nutrients scale by quantity / serving_size.
        linked_quantity: 30,
        hydration_factor: 0,
        linked_food_id: 'food-espresso-1',
        linked_variant_id: 'var-espresso-1',
        is_quick_add: true,
        sort_order: 1,
      }
    );

    expect(result.id).toBe(101);
    expect(result.is_quick_add).toBe(true);
  });

  it('is idempotent: returns existing preset container and does not create duplicate food or container', async () => {
    const existingPresetContainer = {
      id: 101,
      user_id: userId,
      name: 'Espresso',
      volume: 0,
      linked_quantity: 1,
      unit: 'ml' as const,
      is_primary: false,
      servings_per_container: 1,
      hydration_factor: 0,
      linked_food_id: 'food-espresso-1',
      linked_variant_id: 'var-espresso-1',
      linked_meal_type_id: null,
      is_quick_add: true,
      sort_order: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.mocked(
      waterContainerRepository.getWaterContainersByUserId
    ).mockResolvedValue([existingPresetContainer]);

    const result = await waterContainerService.materializeDrinkPreset(
      userId,
      'espresso'
    );

    expect(result.id).toBe(101);
    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(
      waterContainerRepository.createWaterContainer
    ).not.toHaveBeenCalled();
  });

  it('throws an error if an unknown catalog ID is provided', async () => {
    await expect(
      waterContainerService.materializeDrinkPreset(userId, 'unknown_drink_id')
    ).rejects.toThrow(/not found in catalog/i);
  });

  // The number that matters is not the column but what a press ends up logging:
  // the server computes caffeine as caffeine_mg * quantity / serving_size, so
  // a quantity of 1 silently divided every preset by its serving size.
  it("logs the preset's whole caffeine dose per press, not a fraction of it", async () => {
    vi.mocked(
      waterContainerRepository.getWaterContainersByUserId
    ).mockResolvedValue([]);
    vi.mocked(foodRepository.createFood).mockResolvedValue({
      id: 'food-espresso-1',
      name: 'Espresso',
      user_id: userId,
      is_custom: true,
      shared_with_public: false,
      default_variant: {
        id: 'var-espresso-1',
        food_id: 'food-espresso-1',
        serving_size: 30,
        serving_unit: 'ml',
        caffeine_mg: 63,
        water_ml: 0,
      },
    } as never);
    let capturedQuantity = 0;
    vi.mocked(waterContainerRepository.createWaterContainer).mockImplementation(
      ((_userId: string, body: { linked_quantity: number }) => {
        capturedQuantity = body.linked_quantity;
        return Promise.resolve({ id: 101, ...body });
      }) as never
    );

    await waterContainerService.materializeDrinkPreset(userId, 'espresso');

    // Espresso: 63 mg per 30 ml serving.
    const servingSize = 30;
    const caffeinePerServing = 63;
    const logged = (caffeinePerServing * capturedQuantity) / servingSize;
    expect(logged).toBeCloseTo(63, 5);
  });

  // The idempotency check above only sees containers, so deleting a preset and
  // adding it again created a fresh food each time. Four "Double Espresso"
  // foods accumulated on the dev database that way, three of them orphans.
  it("reuses the user's existing food instead of orphaning another copy", async () => {
    vi.mocked(
      waterContainerRepository.getWaterContainersByUserId
    ).mockResolvedValue([]);
    vi.mocked(foodRepository.findVisibleFoodByName).mockResolvedValue({
      id: 'food-espresso-existing',
      name: 'Espresso',
      default_variant: {
        id: 'var-existing',
        serving_size: 30,
        serving_unit: 'ml',
      },
    } as never);
    vi.mocked(waterContainerRepository.createWaterContainer).mockResolvedValue({
      id: 101,
    } as never);

    await waterContainerService.materializeDrinkPreset(userId, 'espresso');

    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(waterContainerRepository.createWaterContainer).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        linked_food_id: 'food-espresso-existing',
        linked_variant_id: 'var-existing',
      })
    );
  });

  it('sizes the press by the reused food, which may differ from the catalog', async () => {
    vi.mocked(
      waterContainerRepository.getWaterContainersByUserId
    ).mockResolvedValue([]);
    // The user's own espresso is a 50 ml serving, not the catalog's 30.
    vi.mocked(foodRepository.findVisibleFoodByName).mockResolvedValue({
      id: 'food-espresso-existing',
      name: 'Espresso',
      default_variant: { id: 'var-existing', serving_size: 50 },
    } as never);
    vi.mocked(waterContainerRepository.createWaterContainer).mockResolvedValue({
      id: 101,
    } as never);

    await waterContainerService.materializeDrinkPreset(userId, 'espresso');

    expect(waterContainerRepository.createWaterContainer).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ linked_quantity: 50 })
    );
  });

  it('gives every catalog entry energy that reconciles with its macros', () => {
    // Atwater factors: 4 kcal/g protein and carbohydrate, 9 for fat, 7 for
    // ethanol. Alcohol's contribution is inside caloriesKcal, never added on
    // top of it, so the two must agree here or the diary and the label will
    // disagree in front of the user.
    for (const preset of DRINK_PRESET_CATALOG) {
      expect(preset.caloriesKcal, preset.id).toBeTypeOf('number');
      const fromMacros =
        (preset.proteinG ?? 0) * 4 +
        (preset.carbsG ?? 0) * 4 +
        (preset.fatG ?? 0) * 9 +
        (preset.alcoholG ?? 0) * 7;
      // Within 10% or 5 kcal, whichever is larger: these are generic drinks,
      // not label transcriptions.
      const tolerance = Math.max(5, (preset.caloriesKcal ?? 0) * 0.1);
      expect(
        Math.abs((preset.caloriesKcal ?? 0) - fromMacros),
        `${preset.id}: ${preset.caloriesKcal} kcal vs ${fromMacros.toFixed(1)} from macros`
      ).toBeLessThanOrEqual(tolerance);
    }
  });
});
