import {
  inventoryConfigFrom,
  normalizePlates,
  suggestBar,
  usesBarbell,
  type PlateInventoryConfig,
  type PlateUnit,
  type StoredPlateInventory,
} from '@workspace/shared';
import type { WatchPlateConfigPayload } from '../../modules/watch-connectivity';

/** The first equipment name with a capital, for the line under the exercise name. */
export function watchEquipmentLabel(
  equipment: readonly string[] | null | undefined
): string | undefined {
  const first = equipment?.map((item) => item.trim()).find(Boolean);
  if (!first) return undefined;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * The bar and plates the watch needs to work out plates per side for any
 * weight it edits to, or nothing for an exercise that is not loaded on a bar.
 * The search itself is `calculatePlateLoad` in `@workspace/shared`; the watch
 * runs the same one on this data (`WatchPlates.swift`).
 */
export function buildWatchPlateConfig(
  equipment: readonly string[] | null | undefined,
  stored: StoredPlateInventory | null | undefined,
  fallbackUnit: PlateUnit
): WatchPlateConfigPayload | undefined {
  if (!usesBarbell(equipment)) return undefined;
  const inventory: PlateInventoryConfig = inventoryConfigFrom(
    stored,
    fallbackUnit
  );
  const bar = suggestBar(equipment, inventory.bars);
  if (!bar) return undefined;
  return {
    unit: inventory.unit,
    barWeight: bar.weight,
    collarWeight: inventory.collarsEnabled ? inventory.collarWeight : 0,
    plates: normalizePlates(inventory.plates),
  };
}
