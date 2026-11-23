import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
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
import { serverOnScreen } from './serverOnScreen';

/** Native auth clears identity queries on account/server replacement. */
export function observeRecipeImportOwner(
  client: QueryClient,
  onChange?: () => void
) {
  let accountRetained = true;
  const identity = () => {
    const profile = client.getQueryData<{ id: string }>(profileQueryKey);
    const config = serverOnScreen(client);
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
  const config = serverOnScreen(client);
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

interface RecipeImportReviewState {
  key: string;
  mappings: Record<string, RecipeImportMapping>;
  suggestions: RecipeImportSuggestionResponse['ingredients'];
  warnings: string[];
  progress: { done: number; total: number } | null;
  suggesting: boolean;
  saving: boolean;
  error: Error | null;
  saved: RecipeImportSaveResponse | null;
  uncertain: boolean;
}

/**
 * The review's authoritative state, readable synchronously from async
 * handlers (a React state mirror would lag a render behind a `suggest` loop),
 * plus the identity of the review it belongs to. Components read it through
 * `useSyncExternalStore`.
 */
class RecipeImportSession {
  private snapshot: RecipeImportReviewState;
  private identityToken: { key: string };
  private mounted = true;
  private currentScope: string | null;
  private listeners = new Set<() => void>();

  constructor(initial: RecipeImportReviewState, scope: string | null) {
    this.snapshot = initial;
    this.identityToken = { key: initial.key };
    this.currentScope = scope;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  get state() {
    return this.snapshot;
  }

  get scope() {
    return this.currentScope;
  }

  setScope(scope: string | null) {
    this.currentScope = scope;
  }

  setMounted(mounted: boolean) {
    this.mounted = mounted;
  }

  isMounted() {
    return this.mounted;
  }

  /** The token a handler captures; a new key replaces it and orphans old handlers. */
  reviewFor(key: string) {
    if (this.identityToken.key !== key) this.identityToken = { key };
    return this.identityToken;
  }

  isReview(review: { key: string }) {
    return this.identityToken === review;
  }

  /** Called during render when the review key changed: no notification needed. */
  resetFor(key: string, fresh: () => RecipeImportReviewState) {
    if (this.snapshot.key !== key) this.snapshot = fresh();
  }

  update(patch: Partial<RecipeImportReviewState>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

export function useRecipeImport(
  preview: RecipeImportPreview,
  scope: string | null
) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = `${scope}:${preview.providerId}:${preview.recipeSlug}:${preview.sourceFingerprint}`;
  function initial(): RecipeImportReviewState {
    return {
      key,
      mappings: scope ? recipeImportInitialMappings(preview.ingredients) : {},
      suggestions: [],
      warnings: [],
      progress: null,
      suggesting: false,
      saving: false,
      error: null,
      saved: null,
      uncertain: false,
    };
  }
  const [session] = useState(() => new RecipeImportSession(initial(), scope));
  session.resetFor(key, initial);
  const review = session.reviewFor(key);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useLayoutEffect(() => {
    session.setScope(scope);
  });
  useEffect(() => {
    session.setMounted(true);
    return () => {
      session.setMounted(false);
    };
  }, [session]);
  const valid = () =>
    session.isMounted() && !!scope && session.isReview(review);
  function update(patch: Partial<RecipeImportReviewState>) {
    if (!valid()) return;
    session.update(patch);
  }
  function confirm(mapping: RecipeImportMapping) {
    if (!valid() || session.state.saved || session.state.saving) return;
    update({
      mappings: {
        ...session.state.mappings,
        [mapping.ingredientId]: mapping,
      },
      suggestions: session.state.suggestions.filter(
        (row) => row.ingredientId !== mapping.ingredientId
      ),
      error: null,
    });
  }
  async function forgetSavedMapping(
    ingredientId: string,
    mappingId: string
  ): Promise<boolean> {
    if (!valid() || session.state.saving || session.state.saved) return false;
    const mappings = { ...session.state.mappings };
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
    if (!valid() || session.state.suggesting || session.state.saved) return;
    const ids = preview.ingredients
      .filter(
        (row) =>
          !row.issues.includes('linked_recipe') &&
          !session.state.mappings[row.ingredientId]
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
        new Set(Object.keys(session.state.mappings))
      )) {
        if (!valid()) return;
        const batch = group.filter((id) => !session.state.mappings[id]);
        if (batch.length) {
          const response = await suggestRecipe({
            providerId: preview.providerId,
            recipeSlug: preview.recipeSlug,
            sourceFingerprint: preview.sourceFingerprint,
            ingredientIds: batch,
            confirmedIngredientIds: Object.keys(session.state.mappings),
            useAi,
          });
          if (!valid()) return;
          update({
            suggestions: mergeRecipeImportSuggestions(
              session.state.suggestions,
              response.ingredients,
              new Set(Object.keys(session.state.mappings))
            ),
            warnings: [
              ...new Set([...session.state.warnings, ...response.warnings]),
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
    if (session.state.saved) return session.state.saved;
    if (session.state.saving || session.state.uncertain)
      throw new Error(
        t('recipeImport.checkLibrary', {
          defaultValue:
            'Check your meals library before trying again. The save outcome is uncertain.',
        })
      );
    const mappings = preview.ingredients.map(
      (row) => session.state.mappings[row.ingredientId]
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
    const retained = () => owner.isCurrent() && session.scope === scope;
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
  return { ...state, confirm, forgetSavedMapping, suggest, save };
}
