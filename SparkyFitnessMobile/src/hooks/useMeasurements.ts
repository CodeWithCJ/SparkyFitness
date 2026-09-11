import { useQuery } from '@tanstack/react-query';
import {
  fetchLatestCheckInMeasurementsOnOrBefore,
  fetchMeasurements,
} from '../services/api/measurementsApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import {
  latestMeasurementsOnOrBeforeQueryKey,
  measurementsQueryKey,
} from './queryKeys';

interface UseMeasurementsOptions {
  date: string;
  enabled?: boolean;
}

export function useMeasurements({
  date,
  enabled = true,
}: UseMeasurementsOptions) {
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

/**
 * The newest recorded value on or before `date`, per standard field — the
 * source of the editor's previous-value suggestions.
 *
 * Deliberately separate from `useMeasurements`, which answers what is recorded
 * on the day itself. Nothing here can be mistaken for the day's real values, so
 * a suggestion can never be submitted by accident.
 */
export function useLatestMeasurementsOnOrBefore({
  date,
  enabled = true,
}: UseMeasurementsOptions) {
  const query = useQuery({
    queryKey: latestMeasurementsOnOrBeforeQueryKey(date),
    queryFn: () => fetchLatestCheckInMeasurementsOnOrBefore(date),
    enabled,
    // A failure here only costs the hint, so it must never surface as the
    // screen's load error or block the form.
    retry: false,
  });

  return {
    latestMeasurements: query.data,
    isLoading: query.isLoading,
  };
}
