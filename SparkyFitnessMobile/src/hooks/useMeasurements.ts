import { useQuery } from '@tanstack/react-query';
import {
  fetchLatestCheckInMeasurementsOnOrBefore,
  fetchMeasurements,
} from '../services/api/measurementsApi';
import { addLog } from '../services/LogService';
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
    // A failure here only costs the hint, so it must never surface as the
    // screen's load error or block the form. It is logged rather than swallowed
    // because the visible symptom is otherwise indistinguishable from "there is
    // no earlier measurement": every field quietly falls back to its empty
    // placeholder, which reads as a real zero for numeric inputs. The error is
    // rethrown so React Query still records the failure.
    queryFn: async () => {
      try {
        return await fetchLatestCheckInMeasurementsOnOrBefore(date);
      } catch (error) {
        addLog(
          `Failed to load previous measurement values: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'WARNING'
        );
        throw error;
      }
    },
    enabled,
    retry: false,
  });

  return {
    latestMeasurements: query.data,
    isLoading: query.isLoading,
    // Surfaced so the screen can tell a failed lookup apart from "no earlier
    // value". Both leave the inputs on their empty placeholder, which reads as a
    // real zero for a numeric field, so the failure must be visible rather than
    // reaching only the app log.
    isError: query.isError,
  };
}
