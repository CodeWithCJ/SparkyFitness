import { useQuery } from '@tanstack/react-query';
import { fetchCustomNutrients, type UserCustomNutrient } from '../services/api/customNutrientsApi';
import { customNutrientsQueryKey } from './queryKeys';

export type { UserCustomNutrient };

interface UseCustomNutrientsOptions {
  enabled?: boolean;
}

/**
 * Fetches the current user's custom nutrient definitions.
 * These are the user-created nutrients (name + unit) stored in user_custom_nutrients.
 * Used to look up labels and units for custom nutrient values in food entries.
 */
export function useCustomNutrients({ enabled = true }: UseCustomNutrientsOptions = {}) {
  const query = useQuery({
    queryKey: customNutrientsQueryKey,
    queryFn: fetchCustomNutrients,
    staleTime: 1000 * 60 * 30, // 30 minutes — definitions rarely change mid-session
    enabled,
  });

  return {
    customNutrients: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
