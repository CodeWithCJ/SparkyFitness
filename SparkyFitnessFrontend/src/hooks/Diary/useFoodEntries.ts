import { useQuery, useMutation, queryOptions } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  loadFoodEntries,
  createFoodEntry,
  updateFoodEntry,
  removeFoodEntry,
  copyFoodEntries,
  copyFoodEntriesFromYesterday,
  getFoodEntryMealsByDate,
  getFoodEntryMealWithComponents,
  createFoodEntryMeal,
  updateFoodEntryMeal,
  deleteFoodEntryMeal,
  type FoodEntryMealUpdateData,
  FoodEntryUpdateData,
  loadDiaryGoals,
} from '@/api/Diary/foodEntryService';

import { goalKeys } from '@/api/keys/goals';
import { foodEntryKeys, foodEntryMealKeys } from '@/api/keys/diary';
import i18n from '@/i18n';
import { useFoodEntryInvalidation } from '../useInvalidateKeys';

export const useFoodEntries = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: foodEntryKeys.byDate(date),
    queryFn: () => loadFoodEntries(date),
    enabled: !!date,
    meta: {
      errorMessage: t('diary.loadError', 'Failed to load food entries.'),
    },
  });
};

export const useDiaryGoals = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: goalKeys.daily.byDate(date),
    queryFn: () => loadDiaryGoals(date),
    enabled: !!date,
    meta: {
      errorMessage: t('diary.goalsLoadError', 'Failed to load daily goals.'),
    },
  });
};

export const useFoodEntryMeals = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: foodEntryMealKeys.byDate(date),
    queryFn: () => getFoodEntryMealsByDate(date),
    enabled: !!date,
    meta: {
      errorMessage: t('diary.mealsLoadError', 'Failed to load meal entries.'),
    },
  });
};

export const foodEntryMealDetailsOptions = (id: string) =>
  queryOptions({
    queryKey: foodEntryMealKeys.detail(id),
    queryFn: () => getFoodEntryMealWithComponents(id),
    enabled: !!id,
    meta: {
      errorMessage: i18n.t(
        'diary.mealDetailsLoadError',
        'Failed to load meal details.'
      ),
    },
  });

export const useCreateFoodEntryMutation = () => {
  const invalidate = useFoodEntryInvalidation();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createFoodEntry,
    onSuccess: () => invalidate(),
    meta: {
      successMessage: t('diary.addSuccess', 'Food added successfully.'),
      errorMessage: t('diary.addError', 'Failed to add food.'),
    },
  });
};

export const useUpdateFoodEntryMutation = () => {
  const invalidate = useFoodEntryInvalidation();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: FoodEntryUpdateData }) =>
      updateFoodEntry(id, data),
    onSuccess: () => invalidate(),
    meta: {
      successMessage: t('diary.updateSuccess', 'Entry updated.'),
      errorMessage: t('diary.updateError', 'Failed to update entry.'),
    },
  });
};

export const useDeleteFoodEntryMutation = () => {
  const { t } = useTranslation();
  const invalidate = useFoodEntryInvalidation();

  return useMutation({
    mutationFn: removeFoodEntry,
    onSuccess: () => invalidate(),
    meta: {
      successMessage: t('diary.deleteSuccess', 'Entry deleted.'),
      errorMessage: t('diary.deleteError', 'Failed to delete entry.'),
    },
  });
};

export const useCopyFoodEntriesMutation = () => {
  const { t } = useTranslation();
  const invalidate = useFoodEntryInvalidation();

  return useMutation({
    mutationFn: ({
      sourceDate,
      sourceMealType,
      targetDate,
      targetMealType,
    }: {
      sourceDate: string;
      sourceMealType: string;
      targetDate: string;
      targetMealType: string;
    }) =>
      copyFoodEntries(sourceDate, sourceMealType, targetDate, targetMealType),
    onSuccess: () => invalidate(),
    meta: {
      successMessage: t('diary.copySuccess', 'Entries copied successfully.'),
      errorMessage: t('diary.copyError', 'Failed to copy entries.'),
    },
  });
};

export const useCopyFoodEntriesFromYesterdayMutation = () => {
  const { t } = useTranslation();
  const invalidate = useFoodEntryInvalidation();

  return useMutation({
    mutationFn: ({
      mealType,
      targetDate,
    }: {
      mealType: string;
      targetDate: string;
    }) => copyFoodEntriesFromYesterday(mealType, targetDate),
    onSuccess: () => invalidate(),
    meta: {
      successMessage: t('diary.copySuccess', 'Entries copied from yesterday.'),
      errorMessage: t('diary.copyError', 'Failed to copy entries.'),
    },
  });
};

export const useCreateFoodEntryMealMutation = () => {
  const { t } = useTranslation();
  const invalidate = useFoodEntryInvalidation();

  return useMutation({
    mutationFn: createFoodEntryMeal,
    onSuccess: () => invalidate(),
    meta: {
      successMessage: t('diary.mealAddSuccess', 'Meal added successfully.'),
      errorMessage: t('diary.mealAddError', 'Failed to add meal.'),
    },
  });
};

export const useUpdateFoodEntryMealMutation = () => {
  const { t } = useTranslation();
  const invalidate = useFoodEntryInvalidation();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: FoodEntryMealUpdateData }) =>
      updateFoodEntryMeal(id, data),
    onSuccess: () => invalidate(),
    meta: {
      successMessage: t(
        'diary.mealUpdateSuccess',
        'Meal updated successfully.'
      ),
      errorMessage: t('diary.mealUpdateError', 'Failed to update meal.'),
    },
  });
};

export const useDeleteFoodEntryMealMutation = () => {
  const { t } = useTranslation();
  const invalidate = useFoodEntryInvalidation();

  return useMutation({
    mutationFn: deleteFoodEntryMeal,
    onSuccess: () => invalidate(),
    meta: {
      successMessage: t('diary.mealDeleteSuccess', 'Meal deleted.'),
      errorMessage: t('diary.mealDeleteError', 'Failed to delete meal.'),
    },
  });
};
