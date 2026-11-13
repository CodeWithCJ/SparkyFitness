import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  HeartRateZonesResponse,
  UpdateHeartRateZonesBody,
} from '@workspace/shared';
import {
  fetchHeartRateZones,
  saveHeartRateZones,
} from '../services/api/heartRateZonesApi';
import { heartRateZonesQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * The person's heart rate zones as the server works them out (their own
 * settings, else their date of birth). Every screen that needs a bpm range
 * reads it here, so suggestions and charts follow the Settings screen.
 */
export function useHeartRateZones(enabled = true) {
  const query = useQuery({
    queryKey: heartRateZonesQueryKey,
    queryFn: fetchHeartRateZones,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);
  return {
    zones: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useUpdateHeartRateZones() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateHeartRateZonesBody) => saveHeartRateZones(body),
    onSuccess: (data: HeartRateZonesResponse) => {
      queryClient.setQueryData(heartRateZonesQueryKey, data);
    },
  });
}
