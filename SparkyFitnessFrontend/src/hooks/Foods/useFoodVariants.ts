import { foodKeys, foodVariantKeys } from '@/api/keys/meals';
import {
  loadFoodVariants,
  saveFood,
} from '@/api/Foods/enhancedCustomFoodFormService';
import { Food, FoodVariant } from '@/types/food';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const foodVariantsOptions = (foodId: string) => ({
  queryKey: foodVariantKeys.byFood(foodId),
  queryFn: () => loadFoodVariants(foodId),
  enabled: !!foodId,
  meta: {
    errorMessage: 'Failed to load food variants.',
  },
});

export const useFoodVariants = (foodId: string, isEnabled: boolean = true) => {
  return useQuery({
    ...foodVariantsOptions(foodId),
    enabled: !!foodId && isEnabled,
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
    }: {
      foodData: Food;
      variants: FoodVariant[];
      userId: string;
      foodId?: string;
    }) => saveFood(foodData, variants, userId, foodId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: foodKeys.all,
      });
    },
    meta: {
      errorMessage: 'Failed to save custom nutrient.',
      successMessage: 'Food saved successfully.',
    },
  });
};
