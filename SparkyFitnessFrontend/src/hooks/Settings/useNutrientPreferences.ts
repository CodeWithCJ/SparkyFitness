import { preferencesKeys } from '@/api/keys/settings';
import {
  resetNutrientDisplayPreference,
  updateNutrientDisplayPreference,
} from '@/api/Settings/nutrientPreferences';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useUpdateNutrientPreferenceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      viewGroup,
      platform,
      visibleNutrients,
    }: {
      viewGroup: string;
      platform: 'desktop' | 'mobile';
      visibleNutrients: string[];
    }) =>
      updateNutrientDisplayPreference(viewGroup, platform, visibleNutrients),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: preferencesKeys.nutrients() });
    },
  });
};

export const useResetNutrientPreferenceMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      viewGroup,
      platform,
    }: {
      viewGroup: string;
      platform: 'desktop' | 'mobile';
    }) => resetNutrientDisplayPreference(viewGroup, platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: preferencesKeys.nutrients() });
    },
    meta: {
      errorMessage: t('preferences.resetError', 'Failed to reset preferences'),
    },
  });
};
