import { useQuery } from '@tanstack/react-query';
import { fetchNutritionTrends } from '../services/api/reportsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { nutritionTrendsQueryKey } from './queryKeys';
import { getTodayDate, addDays } from '../utils/dateUtils';

export type TrendRange = '7d' | '30d' | '90d';

const RANGE_DAYS: Record<TrendRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

interface UseNutritionTrendsOptions {
  range: TrendRange;
  enabled?: boolean;
}

export function useNutritionTrends({ range, enabled = true }: UseNutritionTrendsOptions) {
  const today = getTodayDate();
  const days = RANGE_DAYS[range];
  const startDate = addDays(today, -(days - 1));

  const query = useQuery({
    queryKey: nutritionTrendsQueryKey(startDate, today),
    queryFn: () => fetchNutritionTrends(startDate, today),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
