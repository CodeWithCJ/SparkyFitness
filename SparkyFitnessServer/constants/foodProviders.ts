// Single source of truth for the external food providers the app can search.
//
// This list is intentionally code-level, not derived from the
// `external_provider_types` table: every entry here requires a hand-written
// `case` in `services/externalFoodSearchService.ts#searchProviderFoods`.
// Adding a food-category row to the database does NOT make it searchable, so
// deriving from the table would advertise providers that fail at call time.
export const VALID_PROVIDER_TYPES = [
  'openfoodfacts',
  'usda',
  'fatsecret',
  'mealie',
  'tandoor',
  'yazio',
  'norish',
  'swissfood',
] as const;

export type ProviderType = (typeof VALID_PROVIDER_TYPES)[number];

export function isValidProviderType(value: string): value is ProviderType {
  return (VALID_PROVIDER_TYPES as readonly string[]).includes(value);
}
