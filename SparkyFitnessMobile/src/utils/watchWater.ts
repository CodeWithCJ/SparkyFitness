import { foodVolumeToMl } from '@workspace/shared';
import type { WaterContainer } from '../types/measurements';
import { getServingVolume } from './unitConversions';

/**
 * The water from food to show on the watch's Water page. Null unless food water
 * counts toward intake and the amount is positive. The watch draws the line for
 * any number it receives, and the phone only draws it above zero, so a zero
 * (the setting is on, but nothing logged yet) must not be sent.
 */
export function watchWaterFromFoodMl(
  foodWaterCounts: boolean | null | undefined,
  fromFoodMl: number | null | undefined
): number | null {
  if (!foodWaterCounts) return null;
  if (fromFoodMl == null || !Number.isFinite(fromFoodMl) || fromFoodMl <= 0)
    return null;
  return fromFoodMl;
}

/**
 * Computes the hydration credit (in ml) that one tap of a container logs on the
 * server, mirroring `measurementService.ts` (`changeWaterIntake`):
 * 1. Unlinked container: `volume / servings_per_container`
 * 2. Linked container with volume override (`volume > 0`): `(volume / servings) * hydration_factor`
 * 3. Linked container with explicit variant `water_ml > 0`:
 *    `(water_ml * linked_quantity / serving_size) * hydration_factor`
 * 4. Linked container with volume-based `serving_unit` (e.g. `fl oz`, `ml`, `l`):
 *    `foodVolumeToMl(linked_quantity, serving_unit) * hydration_factor`
 */
export function watchContainerServingVolumeMl(
  container: WaterContainer
): number {
  const unlinkedVolume = getServingVolume(container);
  if (unlinkedVolume != null) {
    return unlinkedVolume;
  }

  const servings = Math.max(1, Number(container.servings_per_container) || 1);
  const amountPerDrink = (Number(container.volume) || 0) / servings;
  const hydrationFactor =
    container.hydration_factor !== undefined &&
    container.hydration_factor !== null &&
    Number.isFinite(Number(container.hydration_factor))
      ? Number(container.hydration_factor)
      : 1.0;

  if (Number(container.volume) > 0) {
    return amountPerDrink * hydrationFactor;
  }

  const linkedQuantity =
    Number(container.linked_quantity) > 0
      ? Number(container.linked_quantity)
      : 1;
  const foodExplicitWater = Number(container.linked_variant_water_ml);
  if (Number.isFinite(foodExplicitWater) && foodExplicitWater > 0) {
    const servingSize = Number(container.linked_variant_serving_size) || 0;
    const consumedWater =
      servingSize > 0
        ? (foodExplicitWater * linkedQuantity) / servingSize
        : foodExplicitWater;
    return consumedWater * hydrationFactor;
  }

  const volFallback = foodVolumeToMl(
    linkedQuantity,
    container.linked_variant_serving_unit || ''
  );
  if (volFallback !== null && Number.isFinite(volFallback)) {
    return volFallback * hydrationFactor;
  }

  return amountPerDrink * hydrationFactor;
}

/**
 * Resolves the unit label to show on a watch container button. Unlinked
 * containers and linked containers with an explicit volume override use their
 * own `container.unit`; food-linked presets with `volume === 0` have a
 * vestigial `unit: 'ml'` in the database and should display in the user's
 * `waterDisplayUnit` preference.
 */
export function watchContainerDisplayUnit(
  container: WaterContainer,
  waterDisplayUnit?: string | null
): string {
  if (!container.linked_food_id || Number(container.volume) > 0) {
    return container.unit || waterDisplayUnit || 'ml';
  }
  return waterDisplayUnit || container.unit || 'ml';
}
