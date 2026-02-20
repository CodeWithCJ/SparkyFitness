import { foodKeys, providerKeys } from '@/api/keys/meals';
import {
  createFoodEntry,
  FoodEntryCreateData,
  loadMiniNutritionTrendData,
} from '@/api/Diary/foodEntryService';
import {
  deleteFood,
  FoodFilter,
  getFoodById,
  getFoodDeletionImpact,
  loadFoods,
  searchMealieFoods,
  searchTandoorFoods,
  togglePublicSharing,
  updateFoodEntriesSnapshot,
} from '@/api/Foods/foodService';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { reportKeys } from '@/api/keys/diary';

export const useFoods = (
  searchTerm: string,
  foodFilter: FoodFilter,
  currentPage: number,
  itemsPerPage: number,
  sortOrder: string
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: foodKeys.list(
      searchTerm,
      foodFilter,
      currentPage,
      itemsPerPage,
      sortOrder
    ),
    queryFn: () =>
      loadFoods(searchTerm, foodFilter, currentPage, itemsPerPage, sortOrder),
    placeholderData: keepPreviousData,
    meta: {
      errorMessage: t(
        'mealManagement.failedToLoadMeals',
        'Failed to load meals.'
      ),
    },
  });
};
export const useToggleFoodPublicMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      foodId,
      currentState,
    }: {
      foodId: string;
      currentState: boolean;
    }) => togglePublicSharing(foodId, currentState),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
    },
    meta: {
      errorMessage: t(
        'foodDatabaseManager.failedToUpdateSharing',
        'Failed to update sharing status.'
      ),
      successMessage: (_data, variables) => {
        const typedVars = variables as { food: string; currentState: boolean };
        return !typedVars.currentState
          ? t(
              'foodDatabaseManager.foodSharedWithPublic',
              'Food shared with public'
            )
          : t('foodDatabaseManager.foodMadePrivate', 'Food made private');
      },
    },
  });
};
export const foodDeletionImpactOptions = (foodId: string) => ({
  queryKey: foodKeys.impact(foodId),
  queryFn: () => getFoodDeletionImpact(foodId),
  staleTime: 1000 * 10,
  enabled: !!foodId,
  meta: {
    errorMessage: i18n.t(
      'foodDatabaseManager.failedToFetchDeletionImpact',
      'Could not fetch deletion impact. Please try again.'
    ),
  },
});

export const foodViewOptions = (foodId: string) => ({
  queryKey: foodKeys.one(foodId),
  queryFn: () => getFoodById(foodId),
  staleTime: 1000 * 10,
  enabled: !!foodId,
  meta: {
    errorMessage: i18n.t(
      'foodDatabaseManager.failedToLoadFoodDetails',
      'Failed to load food details.'
    ),
  },
});
export const useFoodView = (foodId: string, isEnabled: boolean = true) => {
  return useQuery({
    ...foodViewOptions(foodId),
    enabled: !!foodId && isEnabled,
  });
};

export const searchMealieOptions = (
  query: string,
  baseUrl: string,
  apiKey: string,
  providerId: string
) => ({
  queryKey: providerKeys.one(query, providerId),
  queryFn: () => searchMealieFoods(query, baseUrl, apiKey, providerId),
  staleTime: 1000 * 10,
  meta: {
    errorMessage: i18n.t(
      'foodDatabaseManager.failedToSearchMealie',
      'Failed to search Mealie foods.'
    ),
  },
});

export const searchTandoorOptions = (
  query: string,
  baseUrl: string,
  apiKey: string,
  providerId: string
) => ({
  queryKey: providerKeys.one(query, providerId),
  queryFn: () => searchTandoorFoods(query, baseUrl, apiKey, providerId),
  staleTime: 1000 * 10,
  meta: {
    errorMessage: i18n.t(
      'foodDatabaseManager.failedToSearchTandoor',
      'Failed to search Tandoor foods.'
    ),
  },
});

export const useDeleteFoodMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      foodId,
      force = false,
    }: {
      foodId: string;
      force?: boolean;
    }) => deleteFood(foodId, force),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
    },
    meta: {
      errorMessage: t(
        'foodDatabaseManager.failedToDeleteFood',
        'Failed to delete food.'
      ),

      successMessage: 'Food deleted successfully.',
    },
  });
};
export const useCreateFoodMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ foodData }: { foodData: FoodEntryCreateData }) =>
      createFoodEntry(foodData),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
    },
    meta: {
      errorMessage: t(
        'foodDatabaseManager.failedToAddFood',
        'Failed to add food.'
      ),
      successMessage: t(
        'foodDatabaseManager.foodAddedSuccessfully',
        'Food added successfully.'
      ),
    },
  });
};

export const useUpdateFoodEntriesSnapshotMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (syncFoodId: string) => updateFoodEntriesSnapshot(syncFoodId),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
    },
    meta: {
      errorMessage: t(
        'foodDatabaseManager.failedToUpdateFoodSnapshot',
        'Failed to update food entries snapshot.'
      ),
      successMessage: t(
        'foodDatabaseManager.foodSnapshotUpdatedSuccessfully',
        'Food entries snapshot updated successfully.'
      ),
    },
  });
};
export const useMiniNutritionTrendData = (
  userId: string | undefined,
  startDate: string,
  endDate: string
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: reportKeys.nutritionTrendDetail(userId || '', startDate, endDate),
    queryFn: () => loadMiniNutritionTrendData(userId!, startDate, endDate),
    enabled: !!userId && !!startDate && !!endDate,
    meta: {
      errorMessage: t(
        'reports.miniNutritionTrendsError',
        'Failed to load nutrition trend data.'
      ),
    },
  });
};
