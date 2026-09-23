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
  refreshFoodFromSource,
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
import type { FoodDeleteMode } from '@/types/food';
import { FoodDataForBackend } from '@/types/food';
import { useFoodEntryInvalidation } from '../useInvalidateKeys';

export const useFoods = (
  searchTerm: string,
  foodFilter: MealFilter,
  currentPage: number,
  itemsPerPage: number,
  sortOrder: string,
  providerFilter?: string
) => {
  const { t } = useTranslation();
  const providerType = providerFilter ?? 'all';

  return useQuery({
    queryKey: foodKeys.list(
      searchTerm,
      foodFilter,
      currentPage,
      itemsPerPage,
      sortOrder,
      providerType
    ),
    queryFn: () =>
      loadFoods(
        searchTerm,
        foodFilter,
        currentPage,
        itemsPerPage,
        sortOrder,
        undefined,
        providerType
      ),
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
  retry: false,
  enabled: !!foodId,
});
export const useFoodView = (foodId: string, isEnabled: boolean = true) => {
  return useQuery({
    ...foodViewOptions(foodId),
    enabled: !!foodId && isEnabled,
  });
};

export const useDeleteFoodMutation = () => {
  const invalidateFoodEntries = useFoodEntryInvalidation();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      foodId,
      mode = 'delete',
    }: {
      foodId: string;
      mode?: FoodDeleteMode;
    }) => deleteFood(foodId, mode),
    // Every mode can change what the diary shows — delete_with_history removes
    // entries outright, and a plain delete nulls their food_id — so the diary
    // is invalidated alongside the food list. Without this the diary kept
    // rendering rows for a food that no longer exists and opening one 404'd.
    onSuccess: () => {
      invalidateFoodEntries();
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

/**
 * Re-fetches a food's data from its external source. No cache invalidation:
 * the server is only *reading* the source, and nothing is written until the
 * user applies the data to the form and saves.
 */
export const useRefreshFoodFromSourceMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (foodId: string) => refreshFoodFromSource(foodId),
    meta: {
      errorMessage: t(
        'foodDatabaseManager.failedToRefreshFoodFromSource',
        'Failed to refresh food data from source.'
      ),
      successMessage: t(
        'foodDatabaseManager.foodRefreshedFromSource',
        'Food data refreshed from source. Review and save to apply.'
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
