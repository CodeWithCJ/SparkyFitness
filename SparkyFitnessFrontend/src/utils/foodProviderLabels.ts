import { FOOD_PROVIDER_REGISTRY, FOOD_PROVIDER_TYPES } from '@workspace/shared';

// Human-friendly names for the food data sources (foods.provider_type) stored
// by the food import providers. Built from shared FOOD_PROVIDER_REGISTRY plus
// legacy `nutritionix` (which still appears on older rows).
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  ...Object.fromEntries(
    FOOD_PROVIDER_TYPES.map((type) => [
      type,
      FOOD_PROVIDER_REGISTRY[type].shortName,
    ])
  ),
  nutritionix: 'Nutritionix',
};

/**
 * Active provider types that can be used to filter the food list.
 * Shared with the backend (`VALID_PROVIDER_TYPES`) via `@workspace/shared`;
 * legacy `nutritionix` is excluded since no active backend import path
 * exists for it.
 */
export { FOOD_PROVIDER_TYPES } from '@workspace/shared';

/**
 * Maps a food `provider_type` value to a display name.
 *
 * Foods without a data source (`null`/`undefined`/unknown) are labelled
 * "Manual", matching how the provider filter dropdown treats them.
 */
export const getProviderDisplayName = (providerType?: string | null): string =>
  providerType
    ? (PROVIDER_DISPLAY_NAMES[providerType] ?? providerType)
    : 'Manual';
