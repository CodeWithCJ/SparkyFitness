import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardLayoutKeys } from '@/api/keys/dashboardLayouts';
import {
  getDashboardLayout,
  saveDashboardLayout,
  resetDashboardLayout,
  type DashboardLayoutPayload,
  type SavedDashboardLayout,
} from '@/api/Settings/dashboardLayouts';

const SAVE_DEBOUNCE_MS = 800;

/**
 * Loads/persists a page's widget layout. Saves are debounced so dragging /
 * resizing doesn't spam the backend; the query cache is updated optimistically.
 */
export const useDashboardLayout = (pageKey: string) => {
  const queryClient = useQueryClient();
  const queryKey = dashboardLayoutKeys.byPage(pageKey);

  const query = useQuery({
    queryKey,
    queryFn: () => getDashboardLayout(pageKey),
    staleTime: Infinity,
  });

  const { mutate: saveMutate } = useMutation({
    mutationFn: (payload: DashboardLayoutPayload) =>
      saveDashboardLayout(pageKey, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  const { mutate: resetMutate } = useMutation({
    mutationFn: () => resetDashboardLayout(pageKey),
    onSuccess: () => {
      queryClient.setQueryData<SavedDashboardLayout | null>(queryKey, null);
    },
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (payload: DashboardLayoutPayload) => {
      // Optimistically reflect the change in the cache for snappy UI.
      queryClient.setQueryData<SavedDashboardLayout | null>(
        queryKey,
        (prev) => ({
          ...prev,
          ...payload,
        })
      );
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveMutate(payload);
      }, SAVE_DEBOUNCE_MS);
    },
    [queryClient, queryKey, saveMutate]
  );

  const reset = useCallback(
    (options?: { onSuccess?: () => void }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // The mutation's own onSuccess (cache -> null) runs first; the per-call
      // onSuccess fires afterwards, so callers can react once state has settled.
      resetMutate(undefined, options);
    },
    [resetMutate]
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  return {
    saved: query.data ?? null,
    isLoading: query.isLoading,
    save,
    reset,
  };
};
