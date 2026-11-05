import type { FoodPickerMode } from '../types/navigation';

/**
 * True when the food search, scan, add and create screens are picking an item
 * for another screen (a meal being built, a meal plan, a water container, an
 * NFC tag) instead of logging it to the diary. Every one of those screens asks
 * here, so a new picker mode cannot log by mistake on one path.
 */
export function isFoodSelectionMode(mode: FoodPickerMode | undefined): boolean {
  return (
    mode === 'meal-builder' ||
    mode === 'meal-plan' ||
    mode === 'container-link' ||
    mode === 'action-tag'
  );
}
