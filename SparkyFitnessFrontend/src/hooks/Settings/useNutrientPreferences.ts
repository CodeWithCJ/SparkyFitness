import {
  resetNutrientDisplayPreference,
  updateNutrientDisplayPreference,
} from '@/api/Settings/nutrientPreferences';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useUpdateNutrientPreferenceMutation = () => {
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
  });
};

export const useResetNutrientPreferenceMutation = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      viewGroup,
      platform,
    }: {
      viewGroup: string;
      platform: 'desktop' | 'mobile';
    }) => resetNutrientDisplayPreference(viewGroup, platform),
    meta: {
      errorMessage: t('preferences.resetError', 'Failed to reset preferences'),
    },
  });
};
