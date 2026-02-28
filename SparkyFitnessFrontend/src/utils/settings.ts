import { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { DataProvider } from '@/types/settings';

export const providerRequirements: Record<string, string[]> = {
  mealie: ['base_url', 'app_key'],
  tandoor: ['base_url', 'app_key'],
  nutritionix: ['app_id', 'app_key'],
  fatsecret: ['app_id', 'app_key'],
  withings: ['app_id', 'app_key'],
  fitbit: ['app_id', 'app_key'],
  garmin: ['app_id', 'app_key'],
  polar: ['app_id', 'app_key'],
  strava: ['app_id', 'app_key'],
  usda: ['app_key'],
  hevy: ['app_key'],
};

export const validateProvider = (
  provider: Partial<ExternalDataProvider>
): string | null => {
  if (!provider.provider_name) return 'Please fill in the provider name';

  const requiredFields =
    providerRequirements[provider.provider_type || ''] || [];

  for (const field of requiredFields) {
    if (!provider[field as keyof ExternalDataProvider]) {
      return `Please provide ${field} for ${provider.provider_type}`;
    }
  }

  return null;
};

export const getProviderTypes = () => [
  { value: 'openfoodfacts', label: 'OpenFoodFacts' },
  { value: 'nutritionix', label: 'Nutritionix' },
  { value: 'fatsecret', label: 'FatSecret' },
  { value: 'wger', label: 'Wger (Exercise)' },
  { value: 'free-exercise-db', label: 'Free Exercise DB' },
  { value: 'mealie', label: 'Mealie' },
  { value: 'tandoor', label: 'Tandoor' },
  { value: 'withings', label: 'Withings' },
  { value: 'garmin', label: 'Garmin' },
  { value: 'fitbit', label: 'Fitbit' },
  { value: 'polar', label: 'Polar Flow' },
  { value: 'strava', label: 'Strava' },
  { value: 'hevy', label: 'Hevy' },
  { value: 'usda', label: 'USDA' },
];

export const getInitials = (name: string | null) => {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const getProviderCategory = (
  provider: DataProvider
): ('food' | 'exercise' | 'other')[] => {
  switch (provider.provider_type.toLowerCase()) {
    case 'wger':
    case 'free-exercise-db': // Added free-exercise-db
      return ['exercise'];
    case 'fatsecret':
    case 'openfoodfacts':
    case 'mealie':
    case 'tandoor':
    case 'usda':
      return ['food'];
    case 'nutritionix':
      return ['food', 'exercise'];
    default:
      return ['other'];
  }
};
