import { apiFetch } from './apiClient';
import { FoodsResponse, FoodSearchResponse } from '../../types/foods';

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
