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
  return useQuery({
    queryKey: latestManualCustomEntriesQueryKey(date),
    queryFn: () => fetchLatestManualCustomEntriesOnOrBefore(date),
    enabled: !!date && (options?.enabled ?? true),
    // A failure here only costs the hint, so it must never surface as the
    // screen's load error or block the form.
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
      // Today's own row is now the newest value on or before today, so the
      // suggestion for this day has to be recomputed rather than left stale.
      queryClient.invalidateQueries({
        queryKey: latestManualCustomEntriesQueryKey(vars.entry_date),
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
      // A deleted entry must stop being the suggestion for this day.
      queryClient.invalidateQueries({
        queryKey: latestManualCustomEntriesQueryKey(vars.entryDate),
      });
      refreshHealthSyncCache(queryClient);
    },
    onError: (err: Error) => {
      addLog(`Failed to delete custom measurement: ${err.message}`, 'ERROR');
    },
  });
}
