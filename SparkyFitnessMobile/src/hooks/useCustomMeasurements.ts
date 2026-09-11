import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchCustomCategories,
  fetchCustomMeasurementsByDate,
  fetchLatestManualCustomEntriesOnOrBefore,
  saveCustomMeasurement,
  deleteCustomMeasurement,
} from '../services/api/measurementsApi';
import {
  customCategoriesQueryKey,
  customMeasurementsByDateQueryKey,
  latestManualCustomEntriesRootQueryKey,
  latestManualCustomEntriesQueryKey,
} from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { addLog } from '../services/LogService';
import type { SaveCustomMeasurementPayload } from '../types/customMeasurements';

export function useCustomCategories() {
  return useQuery({
    queryKey: customCategoriesQueryKey,
    queryFn: fetchCustomCategories,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCustomMeasurementsByDate(
  date: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: customMeasurementsByDateQueryKey(date),
    queryFn: () => fetchCustomMeasurementsByDate(date),
    enabled: !!date && (options?.enabled ?? true),
    staleTime: 1000 * 60 * 1,
  });
}

/**
 * Latest manual value per custom category on or before `date` — the source of
 * the Daily editor's previous-value suggestions.
 *
 * One request covers every category, so the editor never fans out per category.
 * Separate from `useCustomMeasurementsByDate`, which answers what is recorded on
 * the day itself, so a suggestion can never be mistaken for an actual entry.
 */
export function useLatestManualCustomEntriesOnOrBefore(
  date: string,
  options?: { enabled?: boolean }
) {
  // Returns the whole query so a caller can tell "no earlier value" apart from
  // "the lookup itself failed" — the two look identical on screen otherwise.
  return useQuery({
    queryKey: latestManualCustomEntriesQueryKey(date),
    // A failure here only costs the hint, so it must never surface as the
    // screen's load error or block the form. It is logged rather than swallowed
    // because the visible symptom is otherwise indistinguishable from "this
    // category genuinely has no earlier value": a server without the endpoint
    // answers 404 and every field quietly falls back to its empty placeholder.
    // The error is rethrown so React Query still records the failure.
    queryFn: async () => {
      try {
        return await fetchLatestManualCustomEntriesOnOrBefore(date);
      } catch (error) {
        addLog(
          `Failed to load previous custom measurement values: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'WARNING'
        );
        throw error;
      }
    },
    enabled: !!date && (options?.enabled ?? true),
    retry: false,
  });
}

export function useSaveCustomMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveCustomMeasurementPayload) =>
      saveCustomMeasurement(payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: customMeasurementsByDateQueryKey(vars.entry_date),
      });
      // The saved row can now be the newest value on or before ANY cached day at
      // or after it, not just its own. Invalidating the whole family is required
      // because `staleTime` is Infinity app-wide: a later day already cached
      // would otherwise keep serving the pre-save suggestion.
      queryClient.invalidateQueries({
        queryKey: latestManualCustomEntriesRootQueryKey,
      });
      refreshHealthSyncCache(queryClient);
    },
    onError: (err: Error) => {
      addLog(`Failed to save custom measurement: ${err.message}`, 'ERROR');
    },
  });
}

export function useDeleteCustomMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, entryDate }: { id: string; entryDate: string }) =>
      deleteCustomMeasurement(id),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: customMeasurementsByDateQueryKey(vars.entryDate),
      });
      // A deleted entry must stop being the suggestion for every cached day that
      // could have been resolving to it, for the same `staleTime` reason.
      queryClient.invalidateQueries({
        queryKey: latestManualCustomEntriesRootQueryKey,
      });
      refreshHealthSyncCache(queryClient);
    },
    onError: (err: Error) => {
      addLog(`Failed to delete custom measurement: ${err.message}`, 'ERROR');
    },
  });
}
