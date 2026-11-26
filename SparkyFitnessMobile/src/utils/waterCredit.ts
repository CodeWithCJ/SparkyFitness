import { foodVolumeToMl } from '@workspace/shared';
import type { WaterContainer } from '../types/measurements';

/**
 * How many millilitres one press of a container adds to the day, worked out
 * the way the server does (`upsertWaterIntake`), so a drink waiting on the
 * phone counts the same amount it will once uploaded. A plain container adds
 * its volume per serving; one linked to a food adds, in order, its own volume
 * when it has one (a glass holding more than the food), else the food's water
 * for the amount one press logs, else that amount read as a volume, all times
 * the hydration factor. Null when the container gives no amount to count.
 */
export function waterCreditMl(container: WaterContainer): number | null {
  const servings = Math.max(1, Number(container.servings_per_container) || 1);
  const perServing = Number(container.volume) / servings;
  if (!container.linked_food_id) {
    return Number.isFinite(perServing) ? perServing : null;
  }
  const factor =
    container.hydration_factor !== undefined &&
    container.hydration_factor !== null
      ? Number(container.hydration_factor)
      : 1;
  const quantity =
    Number(container.linked_quantity) > 0
      ? Number(container.linked_quantity)
      : 1;
  if (Number(container.volume) > 0) return perServing * factor;

  const foodWater = Number(container.linked_variant_water_ml);
  if (Number.isFinite(foodWater) && foodWater > 0) {
    const servingSize = Number(container.linked_variant_serving_size) || 0;
    const consumed =
      servingSize > 0 ? (foodWater * quantity) / servingSize : foodWater;
    return consumed * factor;
  }
  const asVolume = foodVolumeToMl(
    quantity,
    container.linked_variant_serving_unit || ''
  );
  if (asVolume !== null) return asVolume * factor;
  const fallback = perServing * factor;
  return Number.isFinite(fallback) ? fallback : null;
}
