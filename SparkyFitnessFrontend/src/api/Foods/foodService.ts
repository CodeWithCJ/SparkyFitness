import { apiCall } from '../api';

import type {
  Food,
  FoodDataForBackend,
  FoodDeletionImpact,
} from '@/types/food';
import { MealFilter } from '@/types/meal';

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
  foodFilter: MealFilter,
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

export const updateFoodEntriesSnapshot = async (
  foodId: string
): Promise<void> => {
  return apiCall(`/foods/update-snapshot`, {
    method: 'POST',
    body: { foodId },
  });
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

export const importFoodsFromCsv = async (
  foods: FoodDataForBackend[]
): Promise<void> => {
  await apiCall('/foods/import-from-csv', {
    method: 'POST',
    body: JSON.stringify({ foods }),
  });
};

// --- V2 API functions ---

export interface V2SearchResponse {
  foods: Food[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
  };
}

export const searchFoodsV2 = async (
  providerType: string,
  query: string,
  providerId?: string,
  page?: number,
  pageSize?: number,
  autoScale?: boolean
): Promise<V2SearchResponse> => {
  const params: Record<string, string> = { query };
  if (providerId) params['providerId'] = providerId;
  if (page) params['page'] = String(page);
  if (pageSize) params['pageSize'] = String(pageSize);
  if (autoScale !== undefined) params['autoScale'] = String(autoScale);

  return apiCall(`/v2/foods/search/${providerType}`, {
    method: 'GET',
    params,
  });
};

export interface V2BarcodeResponse {
  source: string;
  food: Food | null;
}

export const searchBarcodeV2 = async (
  barcode: string,
  providerId?: string
): Promise<V2BarcodeResponse> => {
  const params: Record<string, string> = {};
  if (providerId) params['providerId'] = providerId;

  return apiCall(`/v2/foods/barcode/${barcode}`, {
    method: 'GET',
    params,
  });
};

export const getFoodDetailsV2 = async (
  providerType: string,
  externalId: string,
  providerId?: string
): Promise<Food> => {
  const params: Record<string, string> = {};
  if (providerId) params['providerId'] = providerId;

  return apiCall(`/v2/foods/details/${providerType}/${externalId}`, {
    method: 'GET',
    params,
  });
};
