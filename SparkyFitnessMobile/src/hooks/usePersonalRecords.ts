import { useQuery } from '@tanstack/react-query';
import { fetchPersonalRecords } from '../services/api/exerciseStatsApi';
import { personalRecordsQueryKey } from './queryKeys';
import { usePreferences } from './usePreferences';

/**
 * The person's cardio personal records. Always re-read on mount, since a run
 * saved a moment ago can have set one; the query is one cheap request.
 */
export function usePersonalRecords(enabled = true) {
  const { preferences } = usePreferences();
  const unitSystem =
    preferences?.default_distance_unit === 'miles' ? 'imperial' : 'metric';
  const query = useQuery({
    queryKey: personalRecordsQueryKey(unitSystem),
    queryFn: () => fetchPersonalRecords(unitSystem),
    staleTime: 0,
    enabled,
  });
  return {
    records: query.data?.cardioPRs ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
