import { useEffect, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutateFunction,
  type UseMutateAsyncFunction,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  mergeRecipeImportSuggestions,
  unresolvedRecipeIngredientBatches,
  recipeImportSaveRequestSchema,
  recipeImportInitialMappings,
  type RecipeImportMapping,
  type RecipeImportPreview,
  type RecipeImportSaveRequest,
  type RecipeImportSaveResponse,
  type RecipeImportSuggestionResponse,
  type RecipeImportSyncResponse,
} from '@workspace/shared';
import {
  saveRecipe,
  suggestRecipe,
  fetchRecipeSource,
  syncRecipeNutrition,
  previewRecipeNutritionSync,
  forgetRecipeMapping,
  listRecipeMappings,
} from '../services/api/recipeImportApi';
import { ApiError } from '../services/api/errors';
import type { ServerConfig } from '../services/storage';
import { useServerConfigs } from './useServerConfigs';
import { useProfile } from './useProfile';
import { invalidateFoodCache } from './invalidateFoodCache';
import { invalidateMealCaches } from './useMeals';
import { profileQueryKey, serverConfigsQueryKey } from './queryKeys';

/** Native auth clears identity queries on account/server replacement. */
export function observeRecipeImportOwner(
  client: QueryClient,
  onChange?: () => void
) {
  let accountRetained = true;
  const identity = () => {
    const profile = client.getQueryData<{ id: string }>(profileQueryKey);
    const config = client.getQueryData<{
      activeConfig: { id: string; url: string } | null;
    }>(serverConfigsQueryKey)?.activeConfig;
    return {
      profileId: profile?.id,
      config: config ? `${config.id}:${config.url}` : undefined,
    };
  };
  let owner = identity();
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (
      event.query.queryKey[0] !== profileQueryKey[0] &&
      event.query.queryKey[0] !== serverConfigsQueryKey[0]
    )
      return;
    const next = identity();
    if (
      event.type === 'removed' ||
      (owner.profileId !== undefined && next.profileId !== owner.profileId) ||
      (owner.config !== undefined && next.config !== owner.config)
    ) {
      accountRetained = false;
      onChange?.();
    }
    owner = next;
  });
  return { isCurrent: () => accountRetained, unsubscribe };
}

export function useRecipeImportAccess() {
  const { activeConfig } = useServerConfigs();
  const { profile } = useProfile();
  // Native family diaries use explicit family routes, never the personal recipe routes.
  return activeConfig && profile
    ? `${activeConfig.id}:${activeConfig.url}:${profile.id}`
    : null;
}
function recipeImportConnection(
  client: QueryClient,
  scope: string | null
): ServerConfig | null {
  const config = client.getQueryData<{ activeConfig: ServerConfig | null }>(
    serverConfigsQueryKey
  )?.activeConfig;
  const profile = client.getQueryData<{ id: string }>(profileQueryKey);
  return config &&
    profile &&
    scope === `${config.id}:${config.url}:${profile.id}`
    ? {
        ...config,
        proxyHeaders: config.proxyHeaders?.map((header) => ({ ...header })),
      }
    : null;
}
async function forgetOwnedRecipeMapping(
  client: QueryClient,
  scope: string | null,
  providerId: string,
  mappingId: string,
  valid: () => boolean
): Promise<boolean> {
  const config = recipeImportConnection(client, scope);
  const owner = observeRecipeImportOwner(client);
  try {
    if (!config || !valid() || !owner.isCurrent())
      throw new Error('OWNER_REQUIRED');
    await forgetRecipeMapping(providerId, mappingId, config);
    if (!valid() || !owner.isCurrent()) return false;
    await client.invalidateQueries({
      queryKey: ['recipeImportSavedMappings', scope, providerId],
    });
    return true;
  } finally {
    owner.unsubscribe();
  }
}
export function useRecipeImportSavedMappings(
  providerId: string,
  scope: string | null,
  page: number,
  enabled: boolean
) {
  const client = useQueryClient();
  const current = useRef(scope);
  useEffect(() => {
    current.current = scope;
    return () => {
      current.current = null;
    };
  }, [scope]);
  const valid = () => !!scope && current.current === scope;
  const choices = useQuery({
    queryKey: ['recipeImportSavedMappings', scope, providerId, page],
    enabled: enabled && !!providerId && !!scope,
    retry: false,
    queryFn: () => {
      const config = recipeImportConnection(client, scope);
      if (!config || !valid()) throw new Error('OWNER_REQUIRED');
      return listRecipeMappings(providerId, page, config);
    },
  });
  const forget = useMutation({
    mutationFn: (mappingId: string) =>
      forgetOwnedRecipeMapping(client, scope, providerId, mappingId, valid),
  });
  return { choices, forget };
}
const sourceKey = (scope: string | null, mealId: string) => [
  'meals',
  'recipeImportSource',
  scope,
  mealId,
];
export function useRecipeSource(mealId: string, scope: string | null) {
  const client = useQueryClient();
  const [sourceGeneration, setSourceGeneration] = useState(0);
  const current = useRef(scope);
  const release = useRef<(() => void) | null>(null);
  const reset = useRef<() => void>(() => {});
  useEffect(() => {
    current.current = scope;
    return () => {
      current.current = null;
      release.current?.();
    };
  }, [scope, mealId]);
  useEffect(() => {
    const owner = observeRecipeImportOwner(client, () => reset.current());
    return owner.unsubscribe;
  }, [client, scope]);
  const source = useQuery({
    queryKey: sourceKey(scope, mealId),
    queryFn: () => fetchRecipeSource(mealId),
    enabled: !!scope,
    retry: false,
  });
  function beginSync(confirmationFingerprint?: string) {
    release.current?.();
    const config = recipeImportConnection(client, scope);
    let retained = true;
    const owner = observeRecipeImportOwner(client, () => {
      retained = false;
      reset.current();
    });
    const cleanup = () => {
      retained = false;
      owner.unsubscribe();
    };
    release.current = cleanup;
    const isCurrent = () =>
      retained &&
      owner.isCurrent() &&
      !!config &&
      !!scope &&
      current.current === scope;
    return {
      isCurrent,
      cleanup,
      unsubscribe: owner.unsubscribe,
      send: () => {
        if (!config || !isCurrent()) throw new Error('OWNER_REQUIRED');
        return confirmationFingerprint
          ? syncRecipeNutrition(mealId, config, confirmationFingerprint)
          : syncRecipeNutrition(mealId, config);
      },
      preview: () => {
        if (!config || !isCurrent()) throw new Error('OWNER_REQUIRED');
        return previewRecipeNutritionSync(mealId, config);
      },
    };
  }
  type SyncOperation = ReturnType<typeof beginSync>;
  const sync = useMutation({
    onMutate: (operation: SyncOperation) => operation,
    mutationFn: (operation: SyncOperation) => operation.send(),
    retry: false,
    onSuccess: (response, operation) => {
      if (operation.isCurrent())
        client.setQueryData(sourceKey(scope, mealId), response.source);
    },
    onSettled: (_data, _error, operation) => {
      operation.unsubscribe();
      if (release.current === operation.cleanup) release.current = null;
    },
  });
  const previewSync = useMutation({
    mutationFn: async () => {
      const operation = beginSync();
      try {
        const result = await operation.preview();
        if (!operation.isCurrent()) throw new Error('OWNER_REQUIRED');
        return result;
      } finally {
        operation.cleanup();
        if (release.current === operation.cleanup) release.current = null;
      }
    },
    retry: false,
  });
  const resetSync = sync.reset;
  const resetPreview = previewSync.reset;
  useEffect(() => {
    reset.current = () => {
      resetSync();
      resetPreview();
      setSourceGeneration((generation) => generation + 1);
    };
  }, [resetSync, resetPreview]);
  // Capture the owner before TanStack awaits any cache or mutation onMutate.
  const mutateAsync: UseMutateAsyncFunction<
    RecipeImportSyncResponse,
    Error,
    string | void,
    SyncOperation
  > = (variables, options) =>
    sync.mutateAsync(
      beginSync(variables || undefined),
      options
        ? {
            onSuccess: (data, _operation, result, context) =>
              options.onSuccess?.(data, variables, result, context),
            onError: (error, _operation, result, context) =>
              options.onError?.(error, variables, result, context),
            onSettled: (data, error, _operation, result, context) =>
              options.onSettled?.(data, error, variables, result, context),
          }
        : undefined
    );
  const mutate: UseMutateFunction<
    RecipeImportSyncResponse,
    Error,
    string | void,
    SyncOperation
  > = (variables, options) => {
    void mutateAsync(variables, options).catch(() => {});
  };
  return {
    source,
    previewSync,
    sourceGeneration,
    sync: { ...sync, variables: undefined, mutate, mutateAsync },
  };
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
      mappings: scope ? recipeImportInitialMappings(preview.ingredients) : {},
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
  const retainedScope = useRef(scope);
  retainedScope.current = scope;
  const identity = useRef({ key });
  if (identity.current.key !== key) identity.current = { key };
  const review = identity.current;
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
  const valid = () => alive.current && !!scope && identity.current === review;
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
  async function forgetSavedMapping(
    ingredientId: string,
    mappingId: string
  ): Promise<boolean> {
    if (!valid() || stateRef.current.saving || stateRef.current.saved)
      return false;
    const mappings = { ...stateRef.current.mappings };
    delete mappings[ingredientId];
    update({ mappings });
    return forgetOwnedRecipeMapping(
      client,
      scope,
      preview.providerId,
      mappingId,
      valid
    );
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
    // Auth changes clear these existing identity queries. Keep watching until the
    // request settles, even if the import workspace has already unmounted.
    const owner = observeRecipeImportOwner(client);
    const retained = () => owner.isCurrent() && retainedScope.current === scope;
    const refresh = (mealId?: string) => {
      if (!retained()) return;
      invalidateMealCaches(client, mealId);
      invalidateFoodCache(client);
      for (const root of [
        'mealPlans',
        'foodsLibrary',
        'foodSearch',
        'foodVariants',
      ])
        void client.invalidateQueries({ queryKey: [root] });
    };
    try {
      const response = await saveRecipe(payload);
      refresh(response.mealId);
      if (valid() && retained()) {
        update({ saved: response });
        client.setQueryData(sourceKey(scope, response.mealId), response.source);
      }
      return response;
    } catch (error) {
      const uncertain = !(error instanceof ApiError) || error.statusCode >= 500;
      if (uncertain) refresh();
      if (retained())
        update({
          error: error instanceof Error ? error : new Error('SAVE_FAILED'),
          uncertain,
        });
      throw error;
    } finally {
      owner.unsubscribe();
      update({
        saving: false,
        ...(!retained() ? { saved: null, uncertain: true } : {}),
      });
    }
  }
  return { ...stateRef.current, confirm, forgetSavedMapping, suggest, save };
}
