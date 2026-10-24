import {
  foodKeys,
  foodVariantKeys,
  mealKeys,
  mealPlanKeys,
} from '@/api/keys/meals';
import {
  foodEntryKeys,
  foodEntryMealKeys,
  dailyProgressKeys,
} from '@/api/keys/diary';
import {
  createFoodVariant,
  loadFoodVariants,
  saveFood,
  type FoodCreateProgress,
  type ManagedFoodPortion,
} from '@/api/Foods/enhancedCustomFoodFormService';
import { Food, FoodVariant } from '@/types/food';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import i18n from 'i18next';
export const foodVariantsOptions = (foodId: string) => ({
  queryKey: foodVariantKeys.byFood(foodId),
  queryFn: () => loadFoodVariants(foodId),
  retry: false,
  enabled: !!foodId,
});

export const useFoodVariants = (foodId: string, isEnabled: boolean = true) => {
  return useQuery({
    ...foodVariantsOptions(foodId),
    enabled: !!foodId && isEnabled,
  });
};

export const useCreateFoodVariantMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      foodId,
      variant,
    }: {
      foodId: string;
      variant: Omit<import('@/types/food').FoodVariant, 'id'>;
    }) => createFoodVariant(foodId, variant),

    onSuccess: (_data, { foodId }) => {
      queryClient.invalidateQueries({
        queryKey: foodVariantKeys.byFood(foodId),
      });
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useFoodVariants.failedToCreateFoodVariant',
        'Failed to create food variant.'
      ),
    },
  });
};

export const useSaveFoodMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      foodData,
      variants,
      userId,
      foodId,
      imageFiles,
      onFoodPersisted,
      createProgress,
      managedPortions,
    }: {
      foodData: Food;
      variants: FoodVariant[];
      userId: string;
      foodId?: string;
      /** Newly attached image files; sent as multipart when present. */
      imageFiles?: File[];
      onFoodPersisted?: (food: Food) => void;
      createProgress?: FoodCreateProgress;
      managedPortions?: readonly ManagedFoodPortion[];
    }) =>
      saveFood(
        foodData,
        variants,
        userId,
        foodId,
        imageFiles,
        onFoodPersisted,
        { createProgress, managedPortions }
      ),

    onSuccess: () => {
      for (const queryKey of [
        foodKeys.all,
        mealKeys.all,
        mealPlanKeys.all,
        foodEntryKeys.all,
        foodEntryMealKeys.all,
        dailyProgressKeys.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useFoodVariants.failedToSaveFood',
        'Failed to save food.'
      ),
      successMessage: i18n.t(
        'hooks.useFoodVariants.foodSavedSuccessfully',
        'Food saved successfully.'
      ),
    },
  });
};
