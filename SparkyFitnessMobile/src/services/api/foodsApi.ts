import { apiFetch } from './apiClient';
import { FoodItem, FoodsResponse, FoodSearchResponse, FoodVariantDetail } from '../../types/foods';

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

/**
 * Searches foods by name with server-side pagination.
 */
export const searchFoods = async (searchTerm: string): Promise<FoodSearchResponse> => {
  const params = new URLSearchParams({
    searchTerm,
    currentPage: '1',
    itemsPerPage: '20',
    sortBy: 'name:asc',
  });
  return apiFetch<FoodSearchResponse>({
    endpoint: `/api/foods/foods-paginated?${params.toString()}`,
    serviceName: 'Foods API',
    operation: 'search foods',
  });
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

interface SaveFoodPayload {
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

