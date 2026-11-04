import { useEffect, useRef } from 'react';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  RecipeImportMapping,
  RecipeImportSource,
} from '@workspace/shared';
import {
  browseRecipes,
  getRecipeSource,
  previewRecipe,
  syncRecipeNutrition,
} from '@/api/Foods/recipeImportService';
import { getFoodById, getFoodDetailsV2 } from '@/api/Foods/foodService';
import { getExternalDataProviders } from '@/api/Settings/externalProviderService';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import type { Food } from '@/types/food';
import { foodVariantsOptions } from './useFoodVariants';

async function loadRecipeFood(foodId: string): Promise<Food> {
  const [food, variants] = await Promise.all([
    getFoodById(foodId),
    foodVariantsOptions(foodId).queryFn(),
  ]);
  return { ...food, variants };
}

const foodKey = (ownerId: string | null, foodId?: string) => [
  'foods',
  'recipe-import',
  ownerId,
  foodId,
];

export function useRecipeImportBrowserQueries(
  ownerId: string,
  providerId: string,
  search: string,
  page: number
) {
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const allowed = !isActingOnBehalf && activeUserId === ownerId;
  const providers = useQuery({
    queryKey: ['recipe-import-providers', ownerId],
    queryFn: getExternalDataProviders,
    enabled: allowed,
    retry: false,
  });
  const recipes = useQuery({
    queryKey: ['recipe-import-recipes', ownerId, providerId, search, page],
    queryFn: () => browseRecipes(providerId, search, page),
    enabled: allowed && !!providerId,
    retry: false,
  });
  return { providers, recipes, previewRecipe };
}

export function useRecipeImportFoodAccess(foodId?: string) {
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const client = useQueryClient();
  const details = useQuery({
    queryKey: foodKey(activeUserId, foodId),
    queryFn: () => loadRecipeFood(foodId!),
    enabled: !!foodId && !!activeUserId && !isActingOnBehalf,
    retry: false,
  });
  return {
    details,
    loadFood: getFoodById,
    loadExternalFood: getFoodDetailsV2,
    cacheFood: (food: Food) =>
      client.setQueryData<Food>(foodKey(activeUserId, food.id), (previous) => ({
        ...food,
        variants: food.variants ?? previous?.variants,
      })),
  };
}

export function useRecipeImportNutritionFoods(mappings: RecipeImportMapping[]) {
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  return useQueries({
    queries: mappings.map((mapping) => ({
      queryKey: foodKey(activeUserId, mapping.foodId),
      queryFn: () => loadRecipeFood(mapping.foodId),
      enabled: !!activeUserId && !isActingOnBehalf,
      retry: false,
    })),
  });
}

export function useRecipeImportSource(
  mealId: string,
  ownerId: string,
  initialSource?: RecipeImportSource
) {
  const { t } = useTranslation();
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const client = useQueryClient();
  const key = ['meals', 'recipe-import-source', ownerId, mealId];
  const identity = `${ownerId}:${mealId}`;
  const current = useRef<string | null>(identity);
  useEffect(() => {
    current.current = identity;
    return () => {
      current.current = null;
    };
  }, [identity]);
  const source = useQuery({
    queryKey: key,
    queryFn: () => getRecipeSource(mealId),
    initialData: initialSource,
    enabled: !isActingOnBehalf && activeUserId === ownerId,
    retry: false,
  });
  const sync = useMutation({
    mutationFn: () => {
      if (isActingOnBehalf || activeUserId !== ownerId)
        throw new Error(
          t(
            'recipeImport.ownerOnly',
            'Switch to your own profile to import or sync recipes.'
          )
        );
      return syncRecipeNutrition(mealId);
    },
    retry: false,
    onSuccess: (result) => {
      if (
        current.current === identity &&
        !isActingOnBehalf &&
        activeUserId === ownerId
      )
        client.setQueryData(key, result.source);
    },
  });
  return { source, sync };
}
