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
        linked_quantity: 1,
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
});
