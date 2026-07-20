import { useQuery } from '@tanstack/react-query';
import { getOverview, getInsights, getCorrelations, getFertility } from '../services/api/cycleApi';
import { cycleOverviewQueryKey, cycleInsightsQueryKey, cycleCorrelationsQueryKey, cycleFertilityQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { CycleOverview, CycleInsightsOverview, CycleCorrelations, FertilityDetails } from '../types/womensHealth';

export function useCycleOverview(date?: string) {
  const query = useQuery<CycleOverview>({
    queryKey: [...cycleOverviewQueryKey, date || 'today'],
    queryFn: () => getOverview(date),
  });

  useRefetchOnFocus(query.refetch);

  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCycleInsights() {
  const query = useQuery<CycleInsightsOverview>({
    queryKey: cycleInsightsQueryKey,
    // getInsights on server returns the insights overview
    queryFn: () => getInsights() as any,
  });

  useRefetchOnFocus(query.refetch);

  return {
    insights: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCycleCorrelations() {
  const query = useQuery<CycleCorrelations>({
    queryKey: cycleCorrelationsQueryKey,
    queryFn: () => getCorrelations(),
  });

  useRefetchOnFocus(query.refetch);

  return {
    correlations: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCycleFertility(date?: string) {
  const query = useQuery<FertilityDetails>({
    queryKey: [...cycleFertilityQueryKey, date || 'today'],
    queryFn: () => getFertility(date),
  });

  useRefetchOnFocus(query.refetch);

  return {
    fertility: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
