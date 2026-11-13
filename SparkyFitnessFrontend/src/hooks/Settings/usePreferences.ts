import { apiCall } from '@/api/api';
import { preferencesKeys } from '@/api/keys/settings';
import { upsertUserPreferences } from '@/api/Settings/preferences';
import { dailyProgressKeys, diaryReportKeys } from '@/api/keys/diary';
import { goalKeys } from '@/api/keys/goals';
import { reportKeys } from '@/api/keys/reports';
import {
  useQueryClient,
  useMutation,
  queryOptions,
} from '@tanstack/react-query';

export const preferencesOptions = {
  user: () =>
    queryOptions({
      queryKey: preferencesKeys.user(),
      queryFn: async () => {
        try {
          return await apiCall('/user-preferences', {
            method: 'GET',
            suppress404Toast: true,
          });
        } catch (err: unknown) {
          if (err instanceof Error && err.message.includes('404')) return null;
          throw err;
        }
      },
      staleTime: Infinity,
    }),
  nutrients: () =>
    queryOptions({
      queryKey: preferencesKeys.nutrients(),
      queryFn: () => apiCall('/preferences/nutrient-display'),
    }),
};

export const useUpdatePreferencesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertUserPreferences,
    onMutate: async (preferences) => {
      if (preferences.adaptive_activity_separate === undefined) return;
      // An inactive pre-save request can otherwise finish after invalidation
      // and make the old calorie target fresh again until the next reload.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: dailyProgressKeys.all }),
        queryClient.cancelQueries({ queryKey: goalKeys.all }),
        queryClient.cancelQueries({ queryKey: diaryReportKeys.all }),
        queryClient.cancelQueries({ queryKey: reportKeys.all }),
      ]);
    },
    onSuccess: async (data, preferences) => {
      queryClient.setQueryData(preferencesKeys.user(), data);
      if (preferences.adaptive_activity_separate !== undefined) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: dailyProgressKeys.all }),
          queryClient.invalidateQueries({ queryKey: goalKeys.all }),
          queryClient.invalidateQueries({ queryKey: diaryReportKeys.all }),
          queryClient.invalidateQueries({ queryKey: reportKeys.all }),
        ]);
      }
    },
  });
};
