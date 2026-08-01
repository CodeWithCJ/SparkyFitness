import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchCustomCategories,
  fetchCustomMeasurementsByDate,
  saveCustomMeasurement,
  deleteCustomMeasurement,
} from '../services/api/measurementsApi';
import { customCategoriesQueryKey, customMeasurementsByDateQueryKey } from './queryKeys';
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
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: customMeasurementsByDateQueryKey(date),
    queryFn: () => fetchCustomMeasurementsByDate(date),
    enabled: !!date && (options?.enabled ?? true),
    staleTime: 1000 * 60 * 1,
  });
}

export function useSaveCustomMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveCustomMeasurementPayload) => saveCustomMeasurement(payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: customMeasurementsByDateQueryKey(vars.entry_date) });
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
    mutationFn: ({ id, entryDate }: { id: string; entryDate: string }) => deleteCustomMeasurement(id),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: customMeasurementsByDateQueryKey(vars.entryDate) });
      refreshHealthSyncCache(queryClient);
    },
    onError: (err: Error) => {
      addLog(`Failed to delete custom measurement: ${err.message}`, 'ERROR');
    },
  });
}
