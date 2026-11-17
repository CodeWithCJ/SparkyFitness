import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays } from '@workspace/shared';
import type {
  CreateOralCareSessionBody,
  OralCareSettings,
  UpdateOralCareSessionBody,
} from '@workspace/shared';
import {
  createOralCareSession,
  deleteOralCareSession,
  fetchOralCareDaySummary,
  fetchOralCareHistory,
  saveOralCareSettings,
  updateOralCareSession,
} from '../services/api/oralCareApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export const oralCareQueryKeyRoot = ['oralCare'] as const;
export const oralCareDayQueryKey = (date: string) =>
  [...oralCareQueryKeyRoot, 'day', date] as const;
export const oralCareHistoryQueryKey = (startDate: string, endDate: string) =>
  [...oralCareQueryKeyRoot, 'history', startDate, endDate] as const;

/** Days the history view covers, ending on the selected day. */
export const ORAL_CARE_HISTORY_DAYS = 30;

export function useOralCareDay(date: string, enabled = true) {
  const query = useQuery({
    queryKey: oralCareDayQueryKey(date),
    queryFn: () => fetchOralCareDaySummary(date),
    enabled: Boolean(date) && enabled,
  });
  useRefetchOnFocus(query.refetch, Boolean(date) && enabled);
  return query;
}

/** Daily totals, streaks and recent names for a range (the server allows 366 days). */
export function useOralCareRange(
  startDate: string,
  endDate: string,
  enabled = true
) {
  const query = useQuery({
    queryKey: oralCareHistoryQueryKey(startDate, endDate),
    queryFn: () => fetchOralCareHistory(startDate, endDate),
    enabled: Boolean(startDate && endDate) && enabled,
  });
  useRefetchOnFocus(query.refetch, Boolean(startDate && endDate) && enabled);
  return query;
}

export function useOralCareHistory(endDate: string, enabled = true) {
  return useOralCareRange(
    addDays(endDate, -(ORAL_CARE_HISTORY_DAYS - 1)),
    endDate,
    enabled
  );
}

/**
 * Every write can change a day's counts, the streak and the history, so the
 * whole oral care family is refreshed.
 */
export function useOralCareMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: oralCareQueryKeyRoot });

  const create = useMutation({
    mutationFn: (data: CreateOralCareSessionBody) =>
      createOralCareSession(data),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateOralCareSessionBody;
    }) => updateOralCareSession(id, data),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteOralCareSession(id),
    onSuccess: invalidate,
  });
  const saveGoal = useMutation({
    mutationFn: (settings: OralCareSettings) => saveOralCareSettings(settings),
    onSuccess: invalidate,
  });

  return {
    createSession: create.mutateAsync,
    updateSession: (id: string, data: UpdateOralCareSessionBody) =>
      update.mutateAsync({ id, data }),
    deleteSession: remove.mutateAsync,
    saveGoal: saveGoal.mutateAsync,
    isSaving: create.isPending || update.isPending,
    isSavingGoal: saveGoal.isPending,
  };
}
