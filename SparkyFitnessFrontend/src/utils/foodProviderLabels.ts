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
  nutritionix: 'Nutritionix',
};

/**
 * Active provider types that can be used to filter the food list.
 * Mirrors the backend `VALID_PROVIDER_TYPES` (legacy `nutritionix` excluded
 * from filtering since no active backend import path exists for it).
 */
export const FOOD_PROVIDER_TYPES = [
  'openfoodfacts',
  'usda',
  'fatsecret',
  'mealie',
  'tandoor',
  'yazio',
  'norish',
  'swissfood',
] as const;

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
