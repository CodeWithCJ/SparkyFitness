import { OpenFoodFactsProduct } from '@/components/FoodSearch/FoodSearch';
import { apiCall } from '../api';

import type { CSVData, Food, FoodDeletionImpact } from '@/types/food';

export type FoodFilter = 'all' | 'mine' | 'family' | 'public' | 'needs-review';

export interface ExternalDataProvider {
  id: string;
  provider_name: string;
  provider_type:
    | 'openfoodfacts'
    | 'nutritionix'
    | 'fatsecret'
    | 'wger'
    | 'mealie'
    | 'tandoor';
  app_id: string | null;
  app_key: string | null;
  is_active: boolean;
}

interface FoodPayload {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: number;
  serving_unit: string;
  is_custom?: boolean;
  user_id?: string;
  shared_with_public?: boolean;
  provider_external_id?: string;
  provider_type?: string;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  custom_nutrients?: Record<string, string | number>;
}

interface LoadFoodsResponse {
  foods: Food[];
  totalCount: number;
}
export const loadFoods = async (
  searchTerm: string,
  foodFilter: FoodFilter,
  currentPage: number,
  itemsPerPage: number,
  sortBy: string = 'name:asc', // Default sort by name ascending
  userId?: string
): Promise<LoadFoodsResponse> => {
  const params = new URLSearchParams();
  if (searchTerm) {
    // Only add searchTerm if it's not empty
    params.append('searchTerm', searchTerm);
  }
  params.append('foodFilter', foodFilter);
  params.append('currentPage', currentPage.toString());
  params.append('itemsPerPage', itemsPerPage.toString());
  if (userId) params.append('userId', userId);
  params.append('sortBy', sortBy); // Add sortBy parameter
  const response = await apiCall(
    `/foods/foods-paginated?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response;
};

export const togglePublicSharing = async (
  foodId: string,
  currentState: boolean
): Promise<void> => {
  return apiCall(`/foods/${foodId}`, {
    method: 'PUT',
    body: { shared_with_public: !currentState },
  });
};

export const deleteFood = async (
  foodId: string,
  forceDelete: boolean = false,
  userId?: string
): Promise<{ message: string; status: string }> => {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  if (forceDelete) {
    params.append('forceDelete', 'true');
  }
  return apiCall(`/foods/${foodId}?${params.toString()}`, {
    method: 'DELETE',
  });
};

export const createFood = async (payload: FoodPayload): Promise<Food> => {
  return apiCall('/foods', {
    method: 'POST',
    body: payload,
  });
};

export const getFoodDeletionImpact = async (
  foodId: string
): Promise<FoodDeletionImpact> => {
  const response = await apiCall(`/foods/${foodId}/deletion-impact`, {
    method: 'GET',
  });
  return response;
};

export const getFoodById = async (foodId: string): Promise<Food> => {
  return apiCall(`/foods/${foodId}`, {
    method: 'GET',
  });
};

export const searchMealieFoods = async (
  query: string,
  baseUrl: string,
  apiKey: string,
  providerId: string
): Promise<Food[]> => {
  const params = new URLSearchParams();
  params.append('query', query);

  const response = await apiCall(`/foods/mealie/search?${params.toString()}`, {
    method: 'GET',
    headers: {
      'x-mealie-base-url': baseUrl,
      'x-mealie-api-key': apiKey,
      'x-provider-id': providerId,
    },
  });
  return response;
};

export const updateFoodEntriesSnapshot = async (
  foodId: string
): Promise<void> => {
  return apiCall(`/foods/update-snapshot`, {
    method: 'POST',
    body: { foodId },
  });
};

export const searchTandoorFoods = async (
  query: string,
  baseUrl: string,
  apiKey: string,
  providerId: string
): Promise<Food[]> => {
  const params = new URLSearchParams();
  params.append('query', query);

  const response = await apiCall(`/foods/tandoor/search?${params.toString()}`, {
    method: 'GET',
    headers: {
      'x-tandoor-base-url': baseUrl,
      'x-tandoor-api-key': apiKey,
      'x-provider-id': providerId,
    },
  });
  return response || [];
};

export const getRecentAndTopFoods = async (
  limit: number,
  mealType?: string
) => {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (mealType) params.append('mealType', mealType);

  return apiCall(`/foods?${params.toString()}`);
};

export const searchDatabaseFoods = async (
  term: string,
  limit: number,
  mealType?: string
) => {
  const params = new URLSearchParams({
    name: term,
    broadMatch: 'true',
    limit: limit.toString(),
  });
  if (mealType) params.append('mealType', mealType);

  return apiCall(`/foods?${params.toString()}`);
};

export interface OpenFoodFactsSearchResponse {
  products?: OpenFoodFactsProduct[];
}

export interface OpenFoodFactsBarcodeResponse {
  status: number;
  product?: OpenFoodFactsProduct;
}

export const searchOpenFoodFactsApi = async (
  query: string
): Promise<OpenFoodFactsSearchResponse> => {
  return apiCall(
    `/foods/openfoodfacts/search?query=${encodeURIComponent(query)}`
  );
};

export const searchOpenFoodFactsBarcodeApi = async (
  barcode: string
): Promise<OpenFoodFactsBarcodeResponse> => {
  return apiCall(`/foods/openfoodfacts/barcode/${barcode}`);
};

export type FoodDataForBackend = Omit<CSVData, 'id'>;

export const importFoodsFromCsv = async (
  foods: FoodDataForBackend[]
): Promise<void> => {
  await apiCall('/foods/import-from-csv', {
    method: 'POST',
    body: JSON.stringify({ foods }),
  });
};
