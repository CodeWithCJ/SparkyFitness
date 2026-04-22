import { apiFetch } from './apiClient';
import {
  FoodItem,
  FoodsResponse,
  FoodSearchResponse,
  FoodVariantDetail,
  PaginatedFoodsResponse,
} from '../../types/foods';

/**
 * Fetches the list of recent and top foods.
 */
export const fetchFoods = async (): Promise<FoodsResponse> => {
  return apiFetch<FoodsResponse>({
    endpoint: '/api/foods',
    serviceName: 'Foods API',
    operation: 'fetch foods',
  });
};

export interface FetchFoodsPageOptions {
  searchTerm?: string;
  page?: number;
  itemsPerPage?: number;
  sortBy?: string;
}

export const fetchFoodsPage = async ({
  searchTerm = '',
  page = 1,
  itemsPerPage = 20,
  sortBy = 'name:asc',
}: FetchFoodsPageOptions = {}): Promise<PaginatedFoodsResponse> => {
  const params = new URLSearchParams({
    searchTerm,
    currentPage: String(page),
    itemsPerPage: String(itemsPerPage),
    sortBy,
  });

  const response = await apiFetch<FoodSearchResponse>({
    endpoint: `/api/foods/foods-paginated?${params.toString()}`,
    serviceName: 'Foods API',
    operation: 'fetch foods page',
  });

  return {
    foods: response.foods,
    pagination: {
      page,
      pageSize: itemsPerPage,
      totalCount: response.totalCount,
      hasMore: page * itemsPerPage < response.totalCount,
    },
  };
};

/**
 * Searches foods by name with server-side pagination.
 */
export const searchFoods = async (searchTerm: string): Promise<FoodSearchResponse> => {
  const response = await fetchFoodsPage({ searchTerm, page: 1, itemsPerPage: 20, sortBy: 'name:asc' });
  return {
    foods: response.foods,
    totalCount: response.pagination.totalCount,
  };
};

/**
 * Fetches all variants for a given food item.
 */
export const fetchFoodVariants = async (foodId: string): Promise<FoodVariantDetail[]> => {
  return apiFetch<FoodVariantDetail[]>({
    endpoint: `/api/foods/food-variants?food_id=${foodId}`,
    serviceName: 'Foods API',
    operation: 'fetch food variants',
  });
};


export interface SaveFoodPayload {
  name: string;
  brand: string | null;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber?: number;
  saturated_fat?: number;
  sodium?: number;
  sugars?: number;
  trans_fat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  cholesterol?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  is_custom?: boolean;
  is_quick_food?: boolean;
  is_default?: boolean;
  barcode?: string | null;
  provider_type?: string | null;
}

/**
 * Saves a food item to the database.
 */
export const saveFood = async (food: SaveFoodPayload): Promise<FoodItem> => {
  return apiFetch<FoodItem>({
    endpoint: '/api/foods',
    serviceName: 'Foods API',
    operation: 'save food',
    method: 'POST',
    body: food,
  });
};

export interface UpdateFoodVariantPayload {
  food_id: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber?: number;
  saturated_fat?: number;
  sodium?: number;
  sugars?: number;
  trans_fat?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  cholesterol?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  custom_nutrients?: Record<string, string | number>;
}

/**
 * Updates a food variant's nutrition values.
 */
export const updateFoodVariant = async (variantId: string, payload: UpdateFoodVariantPayload): Promise<FoodVariantDetail> => {
  return apiFetch<FoodVariantDetail>({
    endpoint: `/api/foods/food-variants/${variantId}`,
    serviceName: 'Foods API',
    operation: 'update food variant',
    method: 'PUT',
    body: payload,
  });
};

export interface UpdateFoodPayload {
  name?: string;
  brand?: string;
}

/**
 * Updates a food item's metadata (name, brand).
 */
export const updateFood = async (foodId: string, payload: UpdateFoodPayload): Promise<FoodItem> => {
  return apiFetch<FoodItem>({
    endpoint: `/api/foods/${foodId}`,
    serviceName: 'Foods API',
    operation: 'update food',
    method: 'PUT',
    body: payload,
  });
};
