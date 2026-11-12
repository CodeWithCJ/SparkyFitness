import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getConversionFactor,
  recipeImportNutritionGaps,
} from '@workspace/shared';
import type {
  RecipeImportMapping,
  RecipeImportSource,
} from '@workspace/shared';
import {
  browseRecipes,
  getRecipeSource,
  previewRecipe,
  syncRecipeNutrition,
  previewRecipeNutritionSync,
  listRecipeMappings,
  forgetRecipeMapping,
} from '@/api/Foods/recipeImportService';
import { getFoodById, getFoodDetailsV2 } from '@/api/Foods/foodService';
import { getExternalDataProviders } from '@/api/Settings/externalProviderService';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { toast } from '@/hooks/use-toast';
import type { Food, FoodVariant } from '@/types/food';
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

export function useRecipeImportSavedMappings(
  ownerId: string,
  providerId: string,
  page: number,
  enabled: boolean
) {
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const client = useQueryClient();
  const allowed = !!ownerId && ownerId === activeUserId && !isActingOnBehalf;
  const current = useRef<string | null>(allowed ? ownerId : null);
  useEffect(() => {
    current.current = allowed ? ownerId : null;
    return () => {
      current.current = null;
    };
  }, [allowed, ownerId]);
  const choices = useQuery({
    queryKey: ['recipe-import-mappings', ownerId, providerId, page],
    queryFn: () => listRecipeMappings(providerId, page),
    enabled: enabled && allowed && !!providerId,
    retry: false,
  });
  const forget = useMutation({
    mutationFn: async (mappingId: string) => {
      if (!allowed || current.current !== ownerId)
        throw new Error('OWNER_REQUIRED');
      await forgetRecipeMapping(providerId, mappingId);
      if (current.current !== ownerId) return false;
      await client.invalidateQueries({
        queryKey: ['recipe-import-mappings', ownerId, providerId],
      });
      return true;
    },
  });
  return { choices, forget };
}

export function useRecipeImportFoodAccess(foodId?: string) {
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const client = useQueryClient();
  const ownerScope = !isActingOnBehalf ? activeUserId : null;
  const currentScope = useRef(ownerScope);
  useEffect(() => {
    currentScope.current = ownerScope;
    return () => {
      currentScope.current = null;
    };
  }, [ownerScope]);
  const detailsKey = foodKey(activeUserId, foodId);
  const details = useQuery({
    queryKey: detailsKey,
    queryFn: () => loadRecipeFood(foodId!),
    enabled: !!foodId && !!activeUserId && !isActingOnBehalf,
    retry: false,
  });
  // Retain the observed query identity: auth can clear/rebuild this key
  // before a new owner render, while a unit-creation callback is still pending.
  const scopeQuery = client
    .getQueryCache()
    .find({ queryKey: detailsKey, exact: true });
  return {
    details,
    loadFood: getFoodById,
    loadExternalFood: getFoodDetailsV2,
    cacheFood: (food: Food, chosenVariant: FoodVariant) => {
      if (
        !ownerScope ||
        currentScope.current !== ownerScope ||
        !scopeQuery ||
        client.getQueryCache().find({ queryKey: detailsKey, exact: true }) !==
          scopeQuery
      )
        return;
      return client.setQueryData<Food>(
        foodKey(activeUserId, food.id),
        (previous) => {
          const variants = new Map(
            [...(previous?.variants ?? []), ...(food.variants ?? [])].map(
              (variant) => [variant.id, variant]
            )
          );
          variants.set(chosenVariant.id, chosenVariant);
          return { ...food, variants: [...variants.values()] };
        }
      );
    },
  };
}

export function useRecipeImportNutrition(mappings: RecipeImportMapping[]) {
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const foods = useQueries({
    queries: mappings.map((mapping) => ({
      queryKey: foodKey(activeUserId, mapping.foodId),
      queryFn: () => loadRecipeFood(mapping.foodId),
      enabled: !!activeUserId && !isActingOnBehalf,
      retry: false,
    })),
  });
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let resolved = 0;
  mappings.forEach((mapping, index) => {
    const food = foods[index]?.data;
    const variant =
      food?.variants?.find((item) => item.id === mapping.variantId) ??
      (food?.default_variant?.id === mapping.variantId
        ? food.default_variant
        : undefined);
    if (!variant || recipeImportNutritionGaps(variant, []).missingCore) return;
    const factor = getConversionFactor(variant.serving_unit, mapping.unit);
    if (
      factor === null ||
      !Number.isFinite(variant.serving_size) ||
      !(variant.serving_size > 0) ||
      !Number.isFinite(mapping.quantity) ||
      !(mapping.quantity > 0)
    )
      return;
    const scale = (mapping.quantity * factor) / variant.serving_size;
    (Object.keys(totals) as (keyof typeof totals)[]).forEach((key) => {
      totals[key] += variant[key] * scale;
    });
    resolved += 1;
  });
  return {
    totals,
    resolved,
    complete:
      mappings.length > 0 &&
      resolved === mappings.length &&
      Object.values(totals).every(Number.isFinite),
  };
}

export function useRecipeImportSource(
  mealId: string,
  ownerId: string,
  initialSource?: RecipeImportSource
) {
  const { t } = useTranslation();
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const client = useQueryClient();
  const key = useMemo(
    () => ['meals', 'recipe-import-source', ownerId, mealId],
    [ownerId, mealId]
  );
  const identity = `${ownerId}:${mealId}`;
  const current = useRef<string | null>(identity);
  const [initial, setInitial] = useState(initialSource);
  const [sourceGeneration, setSourceGeneration] = useState(0);
  const release = useRef<(() => void) | null>(null);
  const reset = useRef<() => void>(() => {});
  useEffect(() => {
    current.current = identity;
    return () => {
      current.current = null;
      release.current?.();
    };
  }, [identity]);
  const source = useQuery({
    queryKey: key,
    queryFn: () => getRecipeSource(mealId),
    initialData: initial,
    enabled: !isActingOnBehalf && activeUserId === ownerId,
    retry: false,
  });
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (
          event.type === 'removed' &&
          event.query.queryKey.length === key.length &&
          event.query.queryKey.every(
            (value: unknown, index: number) => value === key[index]
          )
        ) {
          setInitial(undefined);
          setSourceGeneration((generation) => generation + 1);
          reset.current();
        }
      }),
    [client, key]
  );
  const beginOperation = () => {
    release.current?.();
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    let retained = true;
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type !== 'removed' || event.query !== query) return;
      retained = false;
      setInitial(undefined);
      reset.current();
    });
    const cleanup = () => {
      retained = false;
      unsubscribe();
    };
    release.current = cleanup;
    return {
      isCurrent: () =>
        retained &&
        current.current === identity &&
        !!query &&
        client.getQueryCache().find({ queryKey: key, exact: true }) === query,
      cleanup,
      unsubscribe,
    };
  };
  function requireCurrentOwner() {
    if (isActingOnBehalf || activeUserId !== ownerId)
      throw new Error(
        t(
          'recipeImport.ownerOnly',
          'Switch to your own profile to import or sync recipes.'
        )
      );
  }
  const finishOperation = (
    context: ReturnType<typeof beginOperation> | undefined
  ) => {
    context?.unsubscribe();
    if (release.current === context?.cleanup) release.current = null;
  };
  const previewSync = useMutation({
    meta: { silentError: true },
    onMutate: beginOperation,
    mutationFn: () => {
      requireCurrentOwner();
      return previewRecipeNutritionSync(mealId);
    },
    onSettled: (_data, _error, _variables, context) => finishOperation(context),
    retry: false,
  });
  const sync = useMutation({
    // Only a still-current operation may publish its outcome after an identity clear.
    meta: { silentError: true },
    onMutate: beginOperation,
    mutationFn: (confirmationFingerprint: string | void) => {
      requireCurrentOwner();
      return confirmationFingerprint
        ? syncRecipeNutrition(mealId, confirmationFingerprint)
        : syncRecipeNutrition(mealId);
    },
    retry: false,
    onSuccess: (result, _variables, context) => {
      if (context?.isCurrent()) client.setQueryData(key, result.source);
    },
    onError: (error, _variables, context) => {
      if (context?.isCurrent())
        toast({
          title: t('common.error', 'Error'),
          description: error.message,
          variant: 'destructive',
        });
    },
    onSettled: (_data, _error, _variables, context) => {
      finishOperation(context);
    },
  });
  const resetSync = sync.reset;
  const resetPreview = previewSync.reset;
  useEffect(() => {
    reset.current = () => {
      resetSync();
      resetPreview();
    };
  }, [resetSync, resetPreview]);
  return { source, sync, previewSync, sourceGeneration };
}
