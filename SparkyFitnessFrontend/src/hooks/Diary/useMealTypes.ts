import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getMealTypes } from '@/api/Diary/mealTypeService';
import { mealTypeKeys } from '@/api/keys/diary';
import { createMealFromDiary } from '@/api/Foods/meals';
import { mealKeys } from '@/api/keys/meals';

export const useMealTypes = () => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: mealTypeKeys.lists(),
    queryFn: getMealTypes,
    meta: {
      errorMessage: t(
        'mealTypeManager.loadError',
        'Failed to load meal categories.'
      ),
    },
  });
};

export const useCreateMealFromDiaryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      date,
      mealType,
      mealName,
      description,
      isPublic,
    }: {
      date: string;
      mealType: string;
      mealName: string;
      description: string | null;
      isPublic: boolean;
    }) => createMealFromDiary(date, mealType, mealName, description, isPublic),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: mealKeys.all,
      });
    },
    meta: {
      errorMessage: t(
        'mealCreation.failedToCreateMeal',
        'Failed to create meal from diary entries.'
      ),
      successMessage: t(
        'mealCreation.mealCreatedSuccessfully',
        'Meal created successfully from diary entries.'
      ),
    },
  });
};
