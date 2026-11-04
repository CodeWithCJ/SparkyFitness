import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  mergeRecipeImportSuggestions,
  unresolvedRecipeIngredientBatches,
  recipeImportSaveRequestSchema,
  type RecipeImportMapping,
  type RecipeImportPreview,
  type RecipeImportSaveRequest,
  type RecipeImportSaveResponse,
  type RecipeImportSuggestionResponse,
} from '@workspace/shared';
import {
  saveRecipe,
  suggestRecipe,
  fetchRecipeSource,
  syncRecipeNutrition,
} from '../services/api/recipeImportApi';
import { ApiError } from '../services/api/errors';
import { useServerConfigs } from './useServerConfigs';
import { useProfile } from './useProfile';
import { invalidateFoodCache } from './invalidateFoodCache';
import { invalidateMealCaches } from './useMeals';

export function useRecipeImportAccess() {
  const { activeConfig } = useServerConfigs();
  const { profile } = useProfile();
  // Native family diaries use explicit family routes, never the personal recipe routes.
  return activeConfig && profile
    ? `${activeConfig.id}:${activeConfig.url}:${profile.id}`
    : null;
}
const sourceKey = (scope: string | null, mealId: string) => [
  'meals',
  'recipeImportSource',
  scope,
  mealId,
];
export function useRecipeSource(mealId: string, scope: string | null) {
  const client = useQueryClient();
  const current = useRef(scope);
  useEffect(() => {
    current.current = scope;
    return () => {
      current.current = null;
    };
  }, [scope]);
  const source = useQuery({
    queryKey: sourceKey(scope, mealId),
    queryFn: () => fetchRecipeSource(mealId),
    enabled: !!scope,
    retry: false,
  });
  const sync = useMutation({
    mutationFn: async () => {
      if (!scope || current.current !== scope)
        throw new Error('OWNER_REQUIRED');
      return syncRecipeNutrition(mealId);
    },
    retry: false,
    onSuccess: (response) => {
      if (scope && current.current === scope)
        client.setQueryData(sourceKey(scope, mealId), response.source);
    },
  });
  return { source, sync };
}

export function useRecipeImport(
  preview: RecipeImportPreview,
  scope: string | null
) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = `${scope}:${preview.providerId}:${preview.recipeSlug}:${preview.sourceFingerprint}`;
  function initial() {
    return {
      key,
      mappings: scope
        ? (Object.fromEntries(
            preview.ingredients.flatMap((row) =>
              row.mapping ? [[row.ingredientId, row.mapping]] : []
            )
          ) as Record<string, RecipeImportMapping>)
        : {},
      suggestions: [] as RecipeImportSuggestionResponse['ingredients'],
      warnings: [] as string[],
      progress: null as { done: number; total: number } | null,
      suggesting: false,
      saving: false,
      error: null as Error | null,
      saved: null as RecipeImportSaveResponse | null,
      uncertain: false,
    };
  }
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  const identity = useRef(key);
  identity.current = key;
  if (state.key !== key) {
    const fresh = initial();
    stateRef.current = fresh;
    setState(fresh);
  } else stateRef.current = state;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const valid = () => alive.current && !!scope && identity.current === key;
  function update(patch: Partial<typeof state>) {
    if (!valid()) return;
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
  }
  function confirm(mapping: RecipeImportMapping) {
    if (!valid() || stateRef.current.saved || stateRef.current.saving) return;
    update({
      mappings: {
        ...stateRef.current.mappings,
        [mapping.ingredientId]: mapping,
      },
      suggestions: stateRef.current.suggestions.filter(
        (row) => row.ingredientId !== mapping.ingredientId
      ),
      error: null,
    });
  }
  async function suggest(useAi: boolean) {
    if (!valid() || stateRef.current.suggesting || stateRef.current.saved)
      return;
    const ids = preview.ingredients
      .filter(
        (row) =>
          !row.issues.includes('linked_recipe') &&
          !stateRef.current.mappings[row.ingredientId]
      )
      .map((row) => row.ingredientId);
    update({
      suggesting: true,
      error: null,
      warnings: [],
      progress: { done: 0, total: ids.length },
    });
    try {
      let done = 0;
      for (const group of unresolvedRecipeIngredientBatches(
        ids,
        new Set(Object.keys(stateRef.current.mappings))
      )) {
        if (!valid()) return;
        const batch = group.filter((id) => !stateRef.current.mappings[id]);
        if (batch.length) {
          const response = await suggestRecipe({
            providerId: preview.providerId,
            recipeSlug: preview.recipeSlug,
            sourceFingerprint: preview.sourceFingerprint,
            ingredientIds: batch,
            confirmedIngredientIds: Object.keys(stateRef.current.mappings),
            useAi,
          });
          if (!valid()) return;
          update({
            suggestions: mergeRecipeImportSuggestions(
              stateRef.current.suggestions,
              response.ingredients,
              new Set(Object.keys(stateRef.current.mappings))
            ),
            warnings: [
              ...new Set([...stateRef.current.warnings, ...response.warnings]),
            ],
          });
        }
        done += group.length;
        update({ progress: { done, total: ids.length } });
      }
    } catch (error) {
      update({
        error:
          error instanceof Error
            ? error
            : new Error(
                t('recipeImport.suggestFailed', {
                  defaultValue:
                    'Suggestions could not be loaded. Choose foods manually.',
                })
              ),
      });
    } finally {
      update({ suggesting: false });
    }
  }
  async function save(
    options: Pick<
      RecipeImportSaveRequest,
      'name' | 'finishedWeightGrams' | 'servings'
    >
  ) {
    if (!valid()) throw new Error('OWNER_REQUIRED');
    if (stateRef.current.saved) return stateRef.current.saved;
    if (stateRef.current.saving || stateRef.current.uncertain)
      throw new Error(
        t('recipeImport.checkLibrary', {
          defaultValue:
            'Check your meals library before trying again. The save outcome is uncertain.',
        })
      );
    const mappings = preview.ingredients.map(
      (row) => stateRef.current.mappings[row.ingredientId]
    );
    if (
      !mappings.length ||
      mappings.some((row) => !row) ||
      preview.ingredients.some((row) => row.issues.includes('linked_recipe'))
    )
      throw new Error(
        t('recipeImport.finishReview', {
          defaultValue: 'Confirm every ingredient before saving.',
        })
      );
    const payload = recipeImportSaveRequestSchema.parse({
      providerId: preview.providerId,
      recipeSlug: preview.recipeSlug,
      sourceFingerprint: preview.sourceFingerprint,
      ...options,
      mappings,
    });
    update({ saving: true, error: null });
    try {
      const response = await saveRecipe(payload);
      if (valid()) {
        update({ saved: response });
        invalidateMealCaches(client, response.mealId);
        invalidateFoodCache(client);
        for (const root of [
          'mealPlans',
          'foodsLibrary',
          'foodSearch',
          'foodVariants',
        ])
          void client.invalidateQueries({ queryKey: [root] });
        client.setQueryData(sourceKey(scope, response.mealId), response.source);
      }
      return response;
    } catch (error) {
      update({
        error: error instanceof Error ? error : new Error('SAVE_FAILED'),
        uncertain: !(error instanceof ApiError) || error.statusCode >= 500,
      });
      throw error;
    } finally {
      update({ saving: false });
    }
  }
  return { ...stateRef.current, confirm, suggest, save };
}
