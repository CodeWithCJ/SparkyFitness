import { preferencesKeys } from '@/api/keys/settings';
import {
  getNutrientGoalPreferences,
  updateNutrientGoalPreference,
  resetNutrientGoalPreference,
} from '@/api/Settings/nutrientGoalPreferences';
import type { NutrientGoalType } from '@/constants/nutrients';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';

export const useNutrientGoalPreferences = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  return useQuery({
    queryKey: preferencesKeys.nutrientGoalDirection(),
    queryFn: getNutrientGoalPreferences,
    enabled: !!user,
    meta: {
      errorMessage: t(
        'nutrientGoalDirection.failedToLoad',
        'Failed to load nutrient goal direction preferences.'
      ),
    },
  });
};

export const useUpdateNutrientGoalPreferenceMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      nutrientKey,
      goalType,
      targetMin,
      targetMax,
    }: {
      nutrientKey: string;
      goalType: NutrientGoalType;
      targetMin?: number;
      targetMax?: number;
    }) =>
      updateNutrientGoalPreference(nutrientKey, goalType, targetMin, targetMax),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: preferencesKeys.nutrientGoalDirection(),
      });
    },
    meta: {
      errorMessage: t(
        'nutrientGoalDirection.failedToSave',
        'Failed to save nutrient goal direction.'
      ),
    },
  });
};

export const useResetNutrientGoalPreferenceMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (nutrientKey: string) =>
      resetNutrientGoalPreference(nutrientKey),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: preferencesKeys.nutrientGoalDirection(),
      });
    },
    meta: {
      errorMessage: t(
        'nutrientGoalDirection.failedToReset',
        'Failed to reset nutrient goal direction.'
      ),
    },
  });
};
