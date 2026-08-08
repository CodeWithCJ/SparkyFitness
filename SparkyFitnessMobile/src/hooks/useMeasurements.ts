import { useQuery } from '@tanstack/react-query';
import { fetchMeasurements } from '../services/api/measurementsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { measurementsQueryKey } from './queryKeys';

interface UseMeasurementsOptions {
  date: string;
  enabled?: boolean;
}

export function useMeasurements({ date, enabled = true }: UseMeasurementsOptions) {
  const query = useQuery({
    queryKey: measurementsQueryKey(date),
    queryFn: () => fetchMeasurements(date),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    measurements: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
