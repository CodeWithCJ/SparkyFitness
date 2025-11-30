import { apiCall } from './api';

export interface DataProvider {
  id: string;
  name: string;
  provider_type: string; // e.g., 'wger', 'fatsecret', 'openfoodfacts', 'nutritionix'
  provider_name: string; // e.g., 'Wger', 'FatSecret' (for display and value)
  is_active: boolean; // Changed from is_enabled to is_active
  shared_with_public?: boolean;
}

export const getExternalDataProviders = async (): Promise<DataProvider[]> => {
  return apiCall('/external-providers', {
    method: 'GET',
  });
};

export const getProviderCategory = (provider: DataProvider): ('food' | 'exercise' | 'other')[] => {
  switch (provider.provider_type.toLowerCase() || provider.provider_name.toLowerCase()) { // Use provider.provider_type
    case 'wger':
    case 'free-exercise-db': // Added free-exercise-db
      return ['exercise'];
    case 'fatsecret':
    case 'openfoodfacts':
    case 'mealie':
    case 'tandoor':
      return ['food'];
    case 'nutritionix':
      return ['food', 'exercise'];
    default:
      return ['other'];
  }
};

export const toggleProviderPublicSharing = async (id: string, sharedWithPublic: boolean) => {
  return apiCall(`/external-providers/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ shared_with_public: sharedWithPublic }),
  });
};