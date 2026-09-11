import { convertMlToSelectedUnit } from '@/utils/nutritionCalculations';
import type { WaterContainer } from '@/types/settings';

/**
 * What one press of a container is, as a short label.
 *
 * A container linked to a food carries `volume: 0` deliberately -- its amount
 * lives on the food, and a volume there means "the glass holds more than the
 * food". Printing the volume column regardless showed every drink preset as
 * "Double Espresso - 0 ml", which reads as a broken record rather than as a
 * deliberate sentinel. Linked containers are therefore described by the
 * quantity they log, in the linked variant's own unit.
 *
 * Returns an empty string when a linked container has nothing to describe it
 * by, so callers can omit the separator rather than print a dangling dash.
 */
export function describeContainerPress(
  container: Pick<
    WaterContainer,
    | 'volume'
    | 'unit'
    | 'linked_food_id'
    | 'linked_food_name'
    | 'linked_quantity'
    | 'linked_variant_serving_size'
    | 'linked_variant_serving_unit'
  >,
  options: { nonMlDecimals?: number } = {}
): string {
  const { nonMlDecimals = 2 } = options;

  if (container.linked_food_id) {
    const unit = container.linked_variant_serving_unit || '';
    const quantity = Number(container.linked_quantity ?? 1);
    if (unit && Number.isFinite(quantity) && quantity > 0) {
      return `${Number(quantity.toFixed(2))} ${unit}`;
    }
    const servingSize = Number(container.linked_variant_serving_size);
    if (unit && Number.isFinite(servingSize) && servingSize > 0) {
      return `${servingSize} ${unit}`;
    }
    return container.linked_food_name || '';
  }

  const volume = convertMlToSelectedUnit(container.volume, container.unit);
  return `${volume.toFixed(container.unit === 'ml' ? 0 : nonMlDecimals)} ${container.unit}`;
}
