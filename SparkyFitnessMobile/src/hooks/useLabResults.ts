import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../services/api/errors';
import {
  createLabMarker,
  createLabResult,
  deleteLabResult,
  fetchLabMarkers,
  fetchLabResults,
  fetchLatestLabResults,
  type LabMarkerQuery,
  type NewLabMarkerPayload,
} from '../services/api/labResultsApi';
import {
  labHistoryQueryKey,
  labHistoryRootQueryKey,
  labLatestQueryKey,
  labMarkersQueryKey,
} from './queryKeys';
import { useProfile } from './useProfile';
import { addLog } from '../services/LogService';
import { useLabMarkerLabels } from '../utils/labMarkerLabels';
import {
  builtinMarkerId,
  buildLabMarkers,
  customMarkerId,
  labSexFromGender,
  type LabMarker,
} from '../utils/labResults';

/** The markers to list: built-in ones that have results, and the user's own. */
export function useLabMarkers() {
  const markersQuery = useQuery({
    queryKey: labMarkersQueryKey,
    queryFn: fetchLabMarkers,
  });
  const latestQuery = useQuery({
    queryKey: labLatestQueryKey,
    queryFn: fetchLatestLabResults,
  });
  const { profile } = useProfile();
  const labels = useLabMarkerLabels();
  const sex = labSexFromGender(profile?.gender);

  const markers = useMemo<LabMarker[]>(
    () =>
      buildLabMarkers(
        markersQuery.data ?? [],
        latestQuery.data ?? [],
        labels,
        sex
      ),
    [markersQuery.data, latestQuery.data, labels, sex]
  );

  return {
    markers,
    isLoading: markersQuery.isLoading || latestQuery.isLoading,
    isError: markersQuery.isError || latestQuery.isError,
    refetch: async () => {
      await Promise.all([markersQuery.refetch(), latestQuery.refetch()]);
    },
  };
}

/** Every result for one marker, newest first. */
export function useLabHistory(marker: LabMarkerQuery | null) {
  const id = !marker
    ? ''
    : 'markerKey' in marker
      ? builtinMarkerId(marker.markerKey)
      : customMarkerId(marker.markerId);
  return useQuery({
    queryKey: labHistoryQueryKey(id),
    queryFn: () => fetchLabResults(marker as LabMarkerQuery),
    enabled: marker !== null,
  });
}

export interface SaveLabResultInput {
  /** A built-in marker key, a custom marker id, or a new custom marker name. */
  target:
    { markerKey: string } | { markerId: string } | { newMarkerName: string };
  value: number;
  unit: string;
  ref_range_low: number | null;
  ref_range_high: number | null;
  /** Test date, `YYYY-MM-DD`. */
  date: string;
  notes?: string;
}

/**
 * Creates the user's marker, or reuses the one with that name. A save that
 * created the marker but failed to store the result is retried by the person,
 * and the second attempt must not trip over the name it already made.
 */
async function createOrFindLabMarker(payload: NewLabMarkerPayload) {
  try {
    return await createLabMarker(payload);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 409) {
      const existing = (await fetchLabMarkers()).find(
        (m) => m.name.toLowerCase() === payload.name.toLowerCase()
      );
      if (existing) return existing;
    }
    throw error;
  }
}

function invalidateLabCaches(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: labMarkersQueryKey });
  queryClient.invalidateQueries({ queryKey: labLatestQueryKey });
  queryClient.invalidateQueries({ queryKey: labHistoryRootQueryKey });
}

export function useSaveLabResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveLabResultInput) => {
      const { target } = input;
      const base = {
        entry_date: input.date,
        value_numeric: input.value,
        unit: input.unit,
        ref_range_low: input.ref_range_low,
        ref_range_high: input.ref_range_high,
        notes: input.notes?.trim() || undefined,
      };
      if ('markerKey' in target) {
        return createLabResult({ ...base, marker_key: target.markerKey });
      }
      if ('markerId' in target) {
        return createLabResult({ ...base, custom_marker_id: target.markerId });
      }
      const marker = await createOrFindLabMarker({
        name: target.newMarkerName,
        unit: input.unit,
        ref_range_low: input.ref_range_low,
        ref_range_high: input.ref_range_high,
      });
      return createLabResult({ ...base, custom_marker_id: marker.id });
    },
    onSuccess: () => invalidateLabCaches(queryClient),
    onError: (err: Error) => {
      addLog(`Failed to save lab result: ${err.message}`, 'ERROR');
    },
  });
}

export function useDeleteLabResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resultId: string) => deleteLabResult(resultId),
    onSuccess: () => invalidateLabCaches(queryClient),
    onError: (err: Error) => {
      addLog(`Failed to delete lab result: ${err.message}`, 'ERROR');
    },
  });
}
