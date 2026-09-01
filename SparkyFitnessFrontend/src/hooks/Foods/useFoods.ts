import { foodKeys } from '@/api/keys/meals';
import {
  createFoodEntry,
  FoodEntryCreateData,
  loadMiniNutritionTrendData,
} from '@/api/Diary/foodEntryService';
import {
  createFood,
  deleteFood,
  getFoodById,
  getFoodDeletionImpact,
  getRecentAndTopFoods,
  importFoodsFromCsv,
  loadFoods,
  lookupFoodsByName,
  togglePublicSharing,
  updateFoodEntriesSnapshot,
} from '@/api/Foods/foodService';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { diaryReportKeys } from '@/api/keys/diary';
import { MealFilter } from '@/types/meal';
import { FoodDataForBackend } from '@/types/food';
import { useFoodEntryInvalidation } from '../useInvalidateKeys';

export const useFoods = (
  searchTerm: string,
  foodFilter: MealFilter,
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
      queryClient.invalidateQueries({
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
      queryClient.invalidateQueries({
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

export const useCreateFoodDatabaseItemMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof createFood>[0]) =>
      createFood(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
    },
  });
};

export const useUpdateFoodEntriesSnapshotMutation = () => {
  const queryClient = useQueryClient();
  const invalidate = useFoodEntryInvalidation();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      foodId,
      syncImages,
    }: {
      foodId: string;
      syncImages: boolean;
    }) => updateFoodEntriesSnapshot(foodId, syncImages),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
      invalidate();
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
    queryKey: diaryReportKeys.nutritionTrendDetail(
      userId || '',
      startDate,
      endDate
    ),
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

export const useRecentAndTopFoodsQuery = (
  limit: number,
  mealType?: string,
  enabled: boolean = true
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: foodKeys.recentTop(limit, mealType),
    queryFn: () => getRecentAndTopFoods(limit, mealType),
    enabled,
    meta: {
      errorMessage: t(
        'foodDatabaseManager.failedToLoadRecentAndTopFoods',
        'Failed to load recent and top foods.'
      ),
    },
  });
};

export const foodNameLookupOptions = (term: string, limit: number) => ({
  queryKey: foodKeys.nameLookup(term, limit),
  queryFn: () => lookupFoodsByName(term, limit),
});

/**
 * Paginated local-food search for the food search dialog.
 *
 * Uses the same endpoint the Food library and the mobile app already use, so a
 * match that sorts past the first page stays reachable through "Load more"
 * instead of being silently dropped by a fixed LIMIT. `filter` is sent to the
 * server so ownership narrows the result set before the page is cut, not after.
 */
export const useDatabaseFoodSearchQuery = (
  term: string,
  pageSize: number,
  filter: MealFilter = 'all',
  enabled: boolean = true
) => {
  const { t } = useTranslation();

  return useInfiniteQuery({
    queryKey: foodKeys.databaseSearch(term, pageSize, filter),
    queryFn: ({ pageParam = 1 }) =>
      loadFoods(term, filter, pageParam, pageSize, 'name:asc'),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length * pageSize < lastPage.totalCount
        ? allPages.length + 1
        : undefined,
    enabled,
    meta: {
      errorMessage: t(
        'foodDatabaseManager.failedToSearchFoods',
        'Failed to search foods.'
      ),
    },
  });
};

export const useImportCsvMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      foods,
      overwrite,
    }: {
      foods: FoodDataForBackend[];
      overwrite: boolean;
    }) => importFoodsFromCsv(foods, overwrite),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
    },
    meta: {
      errorMessage: t(
        'foodDatabaseManager.failedToImportFoodData',
        'Failed to import food data. Please try again.'
      ),
      successMessage: t(
        'foodDatabaseManager.foodDataImportedSuccessfully',
        'Food data imported successfully.'
      ),
    },
  });
};
