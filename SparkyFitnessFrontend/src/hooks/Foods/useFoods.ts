import { foodKeys, providerKeys } from '@/api/keys/meals';
import {
  createFoodEntry,
  FoodEntryCreateData,
} from '@/services/foodEntryService';
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
      errorTitle: t('common.error', 'Error'),
      errorMessage: t(
        'mealManagement.failedToLoadMeals',
        'Failed to load meals.'
      ),
    },
  });
};
export const useToogleFoodPublicMutation = () => {
  const queryClient = useQueryClient();
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
  });
};
export const foodDeletionImpactOptions = (foodId: string) => ({
  queryKey: foodKeys.impact(foodId),
  queryFn: () => getFoodDeletionImpact(foodId),
  staleTime: 1000 * 10,
  enabled: !!foodId,
});

export const foodViewOptions = (foodId: string) => ({
  queryKey: foodKeys.one(foodId),
  queryFn: () => getFoodById(foodId),
  staleTime: 1000 * 10,
  enabled: !!foodId,
});
export const searchMealieOptions = (
  query: string,
  baseUrl: string,
  apiKey: string,
  providerId: string
) => ({
  queryKey: providerKeys.one(query, providerId),
  queryFn: () => searchMealieFoods(query, baseUrl, apiKey, providerId),
  staleTime: 1000 * 10,
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
});
export const useDeleteFoodMutation = () => {
  const queryClient = useQueryClient();
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
  });
};
export const useCreateFoodMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ foodData }: { foodData: FoodEntryCreateData }) =>
      createFoodEntry(foodData),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
    },
  });
};
export const useUpdateFoodEntriesSnapshotMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (syncFoodId: string) => updateFoodEntriesSnapshot(syncFoodId),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
    },
  });
};
