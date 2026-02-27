import { apiCall } from '@/api/api';
import { preferencesKeys } from '@/api/keys/settings';
import { upsertUserPreferences } from '@/api/Settings/preferences';
import {
  useQueryClient,
  useMutation,
  queryOptions,
} from '@tanstack/react-query';

export const preferencesOptions = {
  user: () =>
    queryOptions({
      queryKey: ['preferences', 'user'],
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
      queryKey: ['preferences', 'nutrients'],
      queryFn: () => apiCall('/preferences/nutrient-display'),
    }),
};

export const useUpdatePreferencesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertUserPreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(preferencesKeys.user(), data);
    },
  });
};
