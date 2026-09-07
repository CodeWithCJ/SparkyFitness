import { useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchFoodVariants } from '../services/api/foodsApi';
import type {
  MealPlanDraftAssignment,
  MealPlanNutritionSnapshot,
} from '../types/mealPlans';
import type { Meal } from '../types/meals';
import { mealToPerServingNutrition } from '../types/foodInfo';
import { foodVariantsQueryKey } from './queryKeys';

export function useMealPlanNutrition(
  assignments: MealPlanDraftAssignment[],
  meals: Meal[]
) {
  const foodIds = useMemo(
    () =>
      Array.from(
        new Set(
          assignments
            .filter(
              (assignment) =>
                assignment.item_type === 'food' && !assignment.nutrition
            )
            .map((assignment) => assignment.food_id)
            .filter((foodId): foodId is string => Boolean(foodId))
        )
      ),
    [assignments]
  );
  const variantQueries = useQueries({
    queries: foodIds.map((foodId) => ({
      queryKey: foodVariantsQueryKey(foodId),
      queryFn: () => fetchFoodVariants(foodId),
      staleTime: 1000 * 60 * 5,
    })),
  });
  const variantsByFoodId = useMemo(
    () =>
      new Map(
        foodIds.map((foodId, index) => [
          foodId,
          variantQueries[index]?.data ?? [],
        ])
      ),
    [foodIds, variantQueries]
  );

  const resolveNutrition = useCallback(
    (
      assignment: MealPlanDraftAssignment
    ): MealPlanNutritionSnapshot | undefined => {
      if (assignment.nutrition) return assignment.nutrition;

      if (assignment.item_type === 'meal') {
        const meal = meals.find(
          (candidate) => candidate.id === assignment.meal_id
        );
        if (!meal) return undefined;
        return mealToPerServingNutrition(meal);
      }

      const variants = assignment.food_id
        ? (variantsByFoodId.get(assignment.food_id) ?? [])
        : [];
      const variant = assignment.variant_id
        ? variants.find((candidate) => candidate.id === assignment.variant_id)
        : (variants.find((candidate) => candidate.is_default) ?? variants[0]);
      if (!variant) return undefined;
      return {
        servingSize: variant.serving_size,
        calories: variant.calories,
        protein: variant.protein,
        carbs: variant.carbs,
        fat: variant.fat,
      };
    },
    [meals, variantsByFoodId]
  );

  return {
    resolveNutrition,
    isLoading: variantQueries.some((query) => query.isLoading),
    isError: variantQueries.some((query) => query.isError),
    refetch: async () => {
      await Promise.all(variantQueries.map((query) => query.refetch()));
    },
  };
}
