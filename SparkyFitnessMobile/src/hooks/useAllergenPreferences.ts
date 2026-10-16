import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import {
  addAllergenPreference,
  fetchAllergenPreferences,
  removeAllergenPreference,
  syncOpenFoodFactsAllergens,
} from '../services/api/allergenPreferencesApi';
import {
  allergenPreferencesQueryKey,
  dailySummaryRootQueryKey,
  foodsQueryKey,
} from './queryKeys';

export function useAllergenPreferences(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};
  const query = useQuery({
    queryKey: allergenPreferencesQueryKey,
    queryFn: fetchAllergenPreferences,
    staleTime: 1000 * 60 * 30,
    enabled,
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useAllergenPreferenceMutations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const onError = () => {
    Toast.show({
      type: 'error',
      text1: t('allergenSettings.errors.error', { defaultValue: 'Error' }),
      text2: t('allergenSettings.errors.updateFailed', {
        defaultValue: 'Failed to update allergens.',
      }),
    });
  };
  const onSettled = () =>
    queryClient.invalidateQueries({ queryKey: allergenPreferencesQueryKey });

  const add = useMutation({
    mutationFn: addAllergenPreference,
    onError,
    onSettled,
  });
  const remove = useMutation({
    mutationFn: removeAllergenPreference,
    onError,
    onSettled,
  });

  return { add, remove };
}

export function useSyncAllergens() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncOpenFoodFactsAllergens,
    onSuccess: ({ updated, total }) => {
      Toast.show({
        type: 'success',
        text1: t('allergenSettings.sync.complete', {
          defaultValue: 'Allergen sync complete',
        }),
        text2:
          total === 0
            ? t('allergenSettings.sync.upToDate', {
                defaultValue:
                  'All your OpenFoodFacts foods already have allergen data.',
              })
            : t('allergenSettings.sync.result', {
                defaultValue: 'Updated {{updated}} of {{total}} food(s).',
                updated,
                total,
              }),
      });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('allergenSettings.sync.failed', {
          defaultValue: 'Sync failed',
        }),
        text2: t('allergenSettings.sync.failedDescription', {
          defaultValue: 'Could not sync allergens. Please try again.',
        }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: foodsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['foodsLibrary'] });
      queryClient.invalidateQueries({ queryKey: ['foodSearch'] });
      queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
    },
  });
}
