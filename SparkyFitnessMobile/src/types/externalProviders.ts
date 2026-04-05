export interface ExternalProvider {
  id: string;
  provider_name: string;
  provider_type: string;
  is_active: boolean;
}

// Allowlist of provider_type values relevant to food search
export const FOOD_PROVIDER_TYPES = new Set([
  'openfoodfacts', 'fatsecret', 'usda', 'mealie', 'tandoor',
]);

// Allowlist of provider_type values relevant to exercise search
export const EXERCISE_PROVIDER_TYPES = new Set([
  'wger', 'free-exercise-db',
]);
