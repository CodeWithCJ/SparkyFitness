import {
  watchContainerDisplayUnit,
  watchContainerServingVolumeMl,
  watchWaterFromFoodMl,
} from '../../src/utils/watchWater';
import type { WaterContainer } from '../../src/types/measurements';

describe('watchWaterFromFoodMl', () => {
  it('sends nothing when food water does not count toward intake', () => {
    expect(watchWaterFromFoodMl(false, 400)).toBeNull();
    expect(watchWaterFromFoodMl(undefined, 400)).toBeNull();
    expect(watchWaterFromFoodMl(null, 400)).toBeNull();
  });

  it('sends the amount from food when the setting is on', () => {
    expect(watchWaterFromFoodMl(true, 400)).toBe(400);
  });

  it('sends nothing when the setting is on but there is no food water to show', () => {
    expect(watchWaterFromFoodMl(true, 0)).toBeNull();
    expect(watchWaterFromFoodMl(true, undefined)).toBeNull();
    expect(watchWaterFromFoodMl(true, NaN)).toBeNull();
    expect(watchWaterFromFoodMl(true, -1)).toBeNull();
  });
});

describe('watchContainerServingVolumeMl', () => {
  it('computes volume per serving for standard unlinked containers', () => {
    const cup: WaterContainer = {
      id: 1,
      name: 'Coffee Cup',
      volume: 295.735,
      unit: 'oz',
      is_primary: true,
      servings_per_container: 1,
    };
    expect(watchContainerServingVolumeMl(cup)).toBeCloseTo(295.735, 2);

    const bottle: WaterContainer = {
      id: 2,
      name: '2L Bottle',
      volume: 2000,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 4,
    };
    expect(watchContainerServingVolumeMl(bottle)).toBe(500);
  });

  it('computes hydration credit for Drip Coffee preset linked to food with water_ml', () => {
    const dripCoffee: WaterContainer = {
      id: 5,
      name: 'Drip Coffee',
      volume: 0,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
      hydration_factor: 1,
      linked_food_id: '52228ff7-1f0b-4ebf-9d2a-aa8c3d89b2df',
      linked_variant_id: '43b61dbd-36ff-4346-9568-55da42c320a1',
      linked_variant_serving_size: 240,
      linked_variant_serving_unit: 'ml',
      linked_variant_water_ml: 240,
      linked_quantity: 240,
      is_quick_add: true,
    };
    expect(watchContainerServingVolumeMl(dripCoffee)).toBe(240);
  });

  it('falls back to foodVolumeToMl when linked food variant has water_ml = 0 (e.g. Coke 12 fl oz)', () => {
    const coke: WaterContainer = {
      id: 7,
      name: 'Coke',
      volume: 0,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
      hydration_factor: 1,
      linked_food_id: '5797e539-b596-490a-a693-b5cdb7cc6c30',
      linked_variant_id: '39396316-d5fa-4195-a830-213d4e447e2f',
      linked_variant_serving_size: 12,
      linked_variant_serving_unit: 'fl oz',
      linked_variant_water_ml: 0,
      linked_quantity: 12,
      is_quick_add: true,
    };
    expect(watchContainerServingVolumeMl(coke)).toBeCloseTo(354.882, 1);
  });

  it('scales linked food water by linked_quantity / serving_size and hydration_factor', () => {
    const beer: WaterContainer = {
      id: 8,
      name: 'Double Espresso',
      volume: 0,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
      hydration_factor: 0.8,
      linked_food_id: 'food-1',
      linked_variant_id: 'var-1',
      linked_variant_serving_size: 30,
      linked_variant_serving_unit: 'ml',
      linked_variant_water_ml: 30,
      linked_quantity: 60,
    };
    expect(watchContainerServingVolumeMl(beer)).toBeCloseTo(48, 2);
  });

  it('prefers explicit container volume override on linked containers', () => {
    const electrolytePowder: WaterContainer = {
      id: 9,
      name: 'Electrolytes in 500ml glass',
      volume: 500,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
      hydration_factor: 1,
      linked_food_id: 'food-powder',
      linked_variant_id: 'var-powder',
      linked_variant_serving_size: 10,
      linked_variant_serving_unit: 'g',
      linked_variant_water_ml: 0,
      linked_quantity: 10,
    };
    expect(watchContainerServingVolumeMl(electrolytePowder)).toBe(500);
  });
});

describe('watchContainerDisplayUnit', () => {
  it('uses container unit for unlinked containers and user display unit for volume-0 linked presets', () => {
    const unlinked: WaterContainer = {
      id: 1,
      name: 'Coffee Cup',
      volume: 295.735,
      unit: 'oz',
      is_primary: true,
      servings_per_container: 1,
    };
    const linkedPreset: WaterContainer = {
      id: 5,
      name: 'Drip Coffee',
      volume: 0,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
      linked_food_id: 'food-1',
    };
    expect(watchContainerDisplayUnit(unlinked, 'ml')).toBe('oz');
    expect(watchContainerDisplayUnit(linkedPreset, 'oz')).toBe('oz');
    expect(watchContainerDisplayUnit(linkedPreset, 'ml')).toBe('ml');
  });
});
