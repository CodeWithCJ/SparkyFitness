import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getOpenFoodFactsAdminSyncStatus,
  getOpenFoodFactsContributionSettings,
  updateOpenFoodFactsContributionSettings,
} from '@/api/Settings/openFoodFactsContributionsService';
import { openFoodFactsContributionKeys } from '@/api/keys/settings';

export const useOpenFoodFactsContributionSettings = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: openFoodFactsContributionKeys.user(),
    queryFn: getOpenFoodFactsContributionSettings,
    refetchInterval: (query) =>
      query.state.data?.serverEnabled ? 30_000 : false,
    meta: {
      errorTitle: t(
        'settings.foodExerciseDataProviders.openFoodFacts.loadErrorTitle',
        'Could not load Open Food Facts contribution settings'
      ),
      errorMessage: t(
        'settings.foodExerciseDataProviders.openFoodFacts.loadError',
        'Please try again later.'
      ),
    },
  });
};

export const useUpdateOpenFoodFactsContributionSettings = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: updateOpenFoodFactsContributionSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(openFoodFactsContributionKeys.user(), settings);
    },
    meta: {
      successMessage: t(
        'settings.foodExerciseDataProviders.openFoodFacts.saveSuccess',
        'Open Food Facts contribution settings saved.'
      ),
      errorTitle: t(
        'settings.foodExerciseDataProviders.openFoodFacts.saveErrorTitle',
        'Could not save Open Food Facts contribution settings'
      ),
      errorMessage: t(
        'settings.foodExerciseDataProviders.openFoodFacts.saveError',
        'Please check the server setting and account connection, then try again.'
      ),
    },
  });
};

export const useOpenFoodFactsAdminSyncStatus = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: openFoodFactsContributionKeys.admin(),
    queryFn: getOpenFoodFactsAdminSyncStatus,
    refetchInterval: (query) => (query.state.data?.enabled ? 30_000 : false),
    meta: {
      errorTitle: t(
        'settings.foodExerciseDataProviders.openFoodFacts.statusErrorTitle',
        'Could not load Open Food Facts upload status'
      ),
      errorMessage: t(
        'settings.foodExerciseDataProviders.openFoodFacts.statusError',
        'Please try again later.'
      ),
    },
  });
};
