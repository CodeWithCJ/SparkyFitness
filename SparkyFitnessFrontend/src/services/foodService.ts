import { apiCall } from './api';

import { Food, FoodDeletionImpact, FoodSearchResult, FoodVariant, GlycemicIndex } from '@/types/food';

export type FoodFilter = 'all' | 'mine' | 'family' | 'public' | 'needs-review';

export interface ExternalDataProvider {
  id: string;
  provider_name: string;
  provider_type: 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'wger' | 'mealie' | 'tandoor';
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
}

export const searchFoods = async (
  userId: string,
  name: string = '', // Make name optional with a default empty string
  targetUserId: string,
  exactMatch: boolean,
  broadMatch: boolean,
  checkCustom: boolean,
  limit?: number, // Make limit optional
  mealType?: string
): Promise<FoodSearchResult> => {
  const params = new URLSearchParams();
  if (name) {
    params.append('name', name);
    params.append('targetUserId', targetUserId);
    params.append('exactMatch', exactMatch.toString());
    params.append('broadMatch', broadMatch.toString());
    params.append('checkCustom', checkCustom.toString());
  }
  if (limit !== undefined) {
    params.append('limit', limit.toString());
  }
  if (mealType !== undefined) {
    params.append('mealType', mealType);
  }

  const response = await apiCall(`/foods?${params.toString()}`, {
    method: 'GET',
  });
  return response as FoodSearchResult; // Cast the response to FoodSearchResult
};

export const getFoodVariantsByFoodId = async (userId: string, foodId: string): Promise<FoodVariant[]> => {
  const response = await apiCall(`/foods/food-variants?food_id=${foodId}`, {
    method: 'GET',
  });
  return response;
};

export const loadFoods = async (
  searchTerm: string,
  foodFilter: FoodFilter,
  currentPage: number,
  itemsPerPage: number,
  userId: string,
  sortBy: string = 'name:asc' // Default sort by name ascending
): Promise<{ foods: Food[]; totalCount: number }> => {
  const params = new URLSearchParams();
  if (searchTerm) { // Only add searchTerm if it's not empty
    params.append('searchTerm', searchTerm);
  }
  params.append('foodFilter', foodFilter);
  params.append('currentPage', currentPage.toString());
  params.append('itemsPerPage', itemsPerPage.toString());
  params.append('userId', userId);
  params.append('sortBy', sortBy); // Add sortBy parameter
  const response = await apiCall(`/foods/foods-paginated?${params.toString()}`, {
    method: 'GET',
  });
  return response;
};

export const togglePublicSharing = async (foodId: string, currentState: boolean): Promise<void> => {
  return apiCall(`/foods/${foodId}`, {
    method: 'PUT',
    body: { shared_with_public: !currentState },
  });
};

export const deleteFood = async (foodId: string, userId: string, forceDelete: boolean = false): Promise<{ message: string; status: string }> => {
  const params = new URLSearchParams();
  params.append('userId', userId);
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

export const getFoodDeletionImpact = async (foodId: string): Promise<FoodDeletionImpact> => {
  const response = await apiCall(`/foods/${foodId}/deletion-impact`, {
    method: 'GET',
  });
  return response;
};

export const updateFood = async (id: string, payload: Partial<FoodPayload>): Promise<Food> => {
  return apiCall(`/foods/${id}`, {
    method: 'PUT',
    body: payload,
  });
};

export const getFoodById = async (foodId: string): Promise<Food> => {
  return apiCall(`/foods/${foodId}`, {
    method: 'GET',
  });
};

export const getFoodDataProviders = async (userId: string): Promise<ExternalDataProvider[]> => {
  console.log('Calling getFoodDataProviders for userId:', userId); // Added log
  const response = await apiCall(`/external-providers/user/${userId}`, {
    method: 'GET',
  });
  console.log('Response from getFoodDataProviders:', response); // Added log
  return response;
};

export const searchMealieFoods = async (
  query: string,
  baseUrl: string,
  apiKey: string,
  userId: string,
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

export const updateFoodEntriesSnapshot = async (foodId: string): Promise<void> => {
  return apiCall(`/foods/update-snapshot`, {
    method: 'POST',
    body: { foodId },
  });
};

export const getMealieFoodDetails = async (
  slug: string,
  baseUrl: string,
  apiKey: string,
  userId: string,
  providerId: string
): Promise<Food | null> => {
  const params = new URLSearchParams();
  params.append('slug', slug);

  const response = await apiCall(`/foods/mealie/details?${params.toString()}`, {
    method: 'GET',
    headers: {
      'x-mealie-base-url': baseUrl,
      'x-mealie-api-key': apiKey,
      'x-provider-id': providerId,
    },
  });
  return response;
};

export const searchTandoorFoods = async (
  query: string,
  baseUrl: string,
  apiKey: string,
  userId: string,
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

export const getTandoorFoodDetails = async (
  id: string, // Tandoor uses 'id' for details
  baseUrl: string,
  apiKey: string,
  userId: string,
  providerId: string
): Promise<Food | null> => {
  const params = new URLSearchParams();
  params.append('id', id);

  const response = await apiCall(`/foods/tandoor/details?${params.toString()}`, {
    method: 'GET',
    headers: {
      'x-tandoor-base-url': baseUrl,
      'x-tandoor-api-key': apiKey,
      'x-provider-id': providerId,
    },
  });
  return response;
};