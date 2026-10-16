// Human-friendly names for the food data sources (foods.provider_type) stored
// by the food import providers. `nutritionix` is a legacy provider type that
// still appears on older rows but has no active backend support.
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openfoodfacts: 'Open Food Facts',
  usda: 'USDA',
  fatsecret: 'FatSecret',
  mealie: 'Mealie',
  tandoor: 'Tandoor',
  yazio: 'Yazio',
  norish: 'Norish',
  swissfood: 'SwissFood',
  'canadian-nutrient-file': 'Canadian Nutrient File',
  livsmedelsverket: 'Swedish Food Agency (Livsmedelsverket)',
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
