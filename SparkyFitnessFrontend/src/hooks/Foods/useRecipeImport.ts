import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
      for (let start = 0; start < ids.length; start += 20) {
        if (!alive.current || !allowed.current) return;
        const batch = ids
          .slice(start, start + 20)
          .filter((id) => !mappingsRef.current[id]);
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
          setSuggestions((previous) => {
            const incoming = response.ingredients.filter(
              (row) => !mappingsRef.current[row.ingredientId]
            );
            const replacing = new Set(incoming.map((row) => row.ingredientId));
            return [
              ...previous.filter(
                (row) =>
                  !replacing.has(row.ingredientId) &&
                  !mappingsRef.current[row.ingredientId]
              ),
              ...incoming,
            ];
          });
          setWarnings((previous) => [
            ...new Set([...previous, ...response.warnings]),
          ]);
        }
        setProgress({
          done: Math.min(start + 20, ids.length),
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
    onSuccess: (result) => {
      invalidateMeals();
      invalidateFoods();
      client.invalidateQueries({ queryKey: ['mealPlans'] });
      client.invalidateQueries({ queryKey: ['v2', 'foods'] });
      client.setQueryData(
        ['recipe-import-source', activeUserId, result.mealId],
        result.source
      );
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
