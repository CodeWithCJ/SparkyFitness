import { useEffect, useId, useRef, useState } from 'react';
import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  mergeRecipeImportSuggestions,
  unresolvedRecipeIngredientBatches,
} from '@workspace/shared';
import type {
  RecipeImportMapping,
  RecipeImportPreview,
  RecipeImportSaveRequest,
  RecipeImportSuggestionResponse,
} from '@workspace/shared';
import { saveRecipe, suggestRecipe } from '@/api/Foods/recipeImportService';
import { HttpApiError } from '@/api/api';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  useMealInvalidation,
  useFoodEntryInvalidation,
} from '@/hooks/useInvalidateKeys';

type Suggestions = RecipeImportSuggestionResponse['ingredients'];

export function isUncertainRecipeSave(error: unknown): boolean {
  return !(error instanceof HttpApiError) || error.status >= 500;
}

/** One mounted draft per provider/recipe/fingerprint. Async responses cannot seed another draft. */
export function useRecipeImport(preview: RecipeImportPreview) {
  const { t } = useTranslation();
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const [mappings, setMappings] = useState<Record<string, RecipeImportMapping>>(
    () =>
      Object.fromEntries(
        preview.ingredients.flatMap((row) =>
          row.mapping ? [[row.ingredientId, row.mapping]] : []
        )
      )
  );
  const mappingsRef = useRef(mappings);
  const identity = JSON.stringify([
    activeUserId,
    isActingOnBehalf,
    preview.providerId,
    preview.recipeSlug,
    preview.sourceFingerprint,
  ]);
  const currentIdentity = useRef<string | null>(identity);
  useEffect(() => {
    currentIdentity.current = identity;
    return () => {
      currentIdentity.current = null;
    };
  }, [identity]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const allowed = useRef(!isActingOnBehalf && !!activeUserId);
  useEffect(() => {
    allowed.current = !isActingOnBehalf && !!activeUserId;
  }, [activeUserId, isActingOnBehalf]);
  const [suggestions, setSuggestions] = useState<Suggestions>([]);
  const [suggesting, setSuggesting] = useState(false);
  const suggestingRef = useRef(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [suggestionError, setSuggestionError] = useState<Error | null>(null);
  const invalidateMeals = useMealInvalidation();
  const invalidateFoods = useFoodEntryInvalidation();
  const client = useQueryClient();
  const saveScopeId = useId();
  const pendingSaveKey: QueryKey = [
    'recipe-import-pending-save',
    activeUserId,
    saveScopeId,
  ];
  const refreshLibrary = () => {
    invalidateMeals();
    invalidateFoods();
    client.invalidateQueries({ queryKey: ['mealPlans'] });
    client.invalidateQueries({ queryKey: ['v2', 'foods'] });
  };

  function confirm(mapping: RecipeImportMapping) {
    if (!alive.current || !allowed.current) return;
    const next = { ...mappingsRef.current, [mapping.ingredientId]: mapping };
    mappingsRef.current = next;
    setMappings(next);
    setSuggestions((previous) =>
      previous.filter((row) => row.ingredientId !== mapping.ingredientId)
    );
    invalidateFoods();
  }

  async function suggest(useAi: boolean) {
    if (suggestingRef.current || !allowed.current) return;
    suggestingRef.current = true;
    setSuggesting(true);
    setSuggestionError(null);
    setWarnings([]);
    const ids = preview.ingredients
      .filter(
        (row) =>
          !mappingsRef.current[row.ingredientId] &&
          !row.issues.includes('linked_recipe')
      )
      .map((row) => row.ingredientId);
    setProgress({ done: 0, total: ids.length });
    try {
      let done = 0;
      for (const idsBatch of unresolvedRecipeIngredientBatches(
        ids,
        new Set(Object.keys(mappingsRef.current))
      )) {
        if (!alive.current || !allowed.current) return;
        const batch = idsBatch.filter((id) => !mappingsRef.current[id]);
        if (batch.length) {
          const response = await suggestRecipe({
            providerId: preview.providerId,
            recipeSlug: preview.recipeSlug,
            sourceFingerprint: preview.sourceFingerprint,
            ingredientIds: batch,
            confirmedIngredientIds: Object.keys(mappingsRef.current),
            useAi,
          });
          if (!alive.current || !allowed.current) return;
          setSuggestions((previous) =>
            mergeRecipeImportSuggestions(
              previous,
              response.ingredients,
              new Set(Object.keys(mappingsRef.current))
            )
          );
          setWarnings((previous) => [
            ...new Set([...previous, ...response.warnings]),
          ]);
        }
        done += idsBatch.length;
        setProgress({
          done,
          total: ids.length,
        });
      }
    } catch (error) {
      if (alive.current)
        setSuggestionError(
          error instanceof Error
            ? error
            : new Error(
                t(
                  'recipeImport.suggestFailed',
                  'Suggestions could not be loaded. Choose foods manually.'
                )
              )
        );
    } finally {
      suggestingRef.current = false;
      if (alive.current) setSuggesting(false);
    }
  }

  const save = useMutation({
    onMutate: () => ({
      identity,
      ownerId: activeUserId,
      // Library keys predate owner-scoped caches. An empty, mutation-local
      // marker survives dialog unmount, but auth/profile cache.clear() removes
      // it. This also covers library queries created while save is pending.
      scopeQuery: client.getQueryCache().build(client, {
        queryKey: pendingSaveKey,
        gcTime: Infinity,
      }),
    }),
    mutationFn: (request: RecipeImportSaveRequest) => {
      if (!allowed.current)
        throw new Error(
          t(
            'recipeImport.ownerOnly',
            'Switch to your own profile to import or sync recipes.'
          )
        );
      return saveRecipe(request);
    },
    retry: false,
    onSuccess: (result, _request, context) => {
      if (
        !context ||
        !client.getQueryCache().getAll().includes(context.scopeQuery)
      )
        return;
      refreshLibrary();
      if (
        !alive.current ||
        !allowed.current ||
        currentIdentity.current !== context?.identity
      )
        return;
      client.setQueryData(
        ['meals', 'recipe-import-source', context.ownerId, result.mealId],
        result.source
      );
    },
    onError: (error, _request, context) => {
      // A rejected response can follow a committed meal. Refresh the retained
      // library even after Review closes, before removing its owner marker.
      if (
        isUncertainRecipeSave(error) &&
        context &&
        client.getQueryCache().getAll().includes(context.scopeQuery)
      )
        refreshLibrary();
    },
    onSettled: (_result, _error, _request, context) => {
      client.removeQueries({
        predicate: (query) => query === context?.scopeQuery,
      });
    },
  });

  return {
    mappings,
    confirm,
    suggestions,
    suggest,
    suggesting,
    progress,
    warnings,
    suggestionError,
    save,
  };
}
