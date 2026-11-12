import React from 'react';
import { ApiError } from '../../src/services/api/errors';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type {
  RecipeImportPreview,
  RecipeImportMapping,
  RecipeImportSyncResponse,
} from '@workspace/shared';
import * as storage from '../../src/services/storage';
import {
  profileQueryKey,
  serverConfigsQueryKey,
} from '../../src/hooks/queryKeys';
import {
  useRecipeImport,
  useRecipeSource,
} from '../../src/hooks/useRecipeImport';
import {
  saveRecipe,
  suggestRecipe,
  fetchRecipeSource,
  syncRecipeNutrition,
  forgetRecipeMapping,
} from '../../src/services/api/recipeImportApi';

jest.mock('../../src/services/api/recipeImportApi', () => ({
  saveRecipe: jest.fn(),
  suggestRecipe: jest.fn(),
  fetchRecipeSource: jest.fn(),
  syncRecipeNutrition: jest.fn(),
  forgetRecipeMapping: jest.fn(),
}));
const suggest = jest.mocked(suggestRecipe);
const save = jest.mocked(saveRecipe);
const preview: RecipeImportPreview = {
  providerId: '00000000-0000-4000-a000-000000000001',
  recipeSlug: 'rice',
  recipeId: 'rice',
  name: 'Rice',
  recipeServings: 4,
  sourceFingerprint: 'a'.repeat(64),
  syncWarnings: [],
  ingredients: Array.from({ length: 23 }, (_, index) => ({
    ingredientId: `rice-${index}`,
    sourceFoodKey: 'rice',
    name: 'Rice',
    originalText: 'Rice',
    note: '',
    quantity: 0.6,
    unit: 'kg',
    originalUnit: 'kg',
    issues: [],
    missingNutrients: [],
    mapping: null,
    mappingOrigin: null,
  })),
};
const mapping: RecipeImportMapping = {
  ingredientId: 'rice-0',
  foodId: '00000000-0000-4000-a000-000000000002',
  variantId: '00000000-0000-4000-a000-000000000003',
  quantity: 600,
  unit: 'g',
  confirmed: true,
};
function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  jest.clearAllMocks();
  suggest.mockReset();
  save.mockReset();
  jest.mocked(fetchRecipeSource).mockReset();
  jest.mocked(syncRecipeNutrition).mockReset();
});
afterEach(() => jest.restoreAllMocks());

it('clears native confirmation before the forget request settles using the pinned owner connection', async () => {
  let finish!: (value: { deleted: true }) => void;
  jest.mocked(forgetRecipeMapping).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const client = new QueryClient();
  const config = {
    id: 'server',
    url: 'https://example.test',
    apiKey: 'synthetic-test-key',
  };
  client.setQueryData(profileQueryKey, { id: 'owner' });
  client.setQueryData(serverConfigsQueryKey, { activeConfig: config });
  const scope = `${config.id}:${config.url}:owner`;
  const { result } = renderHook(() => useRecipeImport(preview, scope), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  act(() => result.current.confirm(mapping));
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = result.current.forgetSavedMapping('rice-0', 'mapping');
    await Promise.resolve();
  });
  const whileDeleting = result.current.mappings;
  await act(async () => {
    finish({ deleted: true });
    await pending;
  });
  expect(whileDeleting).toEqual({});
  expect(forgetRecipeMapping).toHaveBeenCalledWith(
    preview.providerId,
    'mapping',
    expect.objectContaining(config)
  );
  expect(saveRecipe).not.toHaveBeenCalled();
});

it('requires a fresh confirmation for a legacy saved mapping before it counts toward saving', () => {
  const legacy: RecipeImportPreview = {
    ...preview,
    ingredients: [
      { ...preview.ingredients[0]!, mapping, mappingOrigin: 'saved' },
    ],
  };
  const { result } = renderHook(() => useRecipeImport(legacy, 'owner-server'), {
    wrapper: Wrapper,
  });
  expect(result.current.mappings).toEqual({});
  act(() => result.current.confirm(mapping));
  expect(result.current.mappings['rice-0']).toEqual(mapping);
});

describe('source sync transport ownership', () => {
  const initialFetch = global.fetch;
  afterEach(() => {
    global.fetch = initialFetch;
  });
  const scope = 'server:https://example.test:owner';
  const source = {
    ...preview,
    mealId: 'meal',
    mappings: [],
    mealFingerprint: 'base',
    syncEligible: true,
    lastSyncedAt: null,
  };
  const response: RecipeImportSyncResponse = {
    status: 'synced',
    source: { ...source, lastSyncedAt: '2026-11-09T10:00:00Z' },
  };
  const config: storage.ServerConfig = {
    id: 'server',
    url: 'https://example.test',
    apiKey: 'synthetic-owner-key',
    proxyHeaders: [{ name: 'X-Proxy-Owner', value: 'original' }],
  };
  const replacement: storage.ServerConfig = {
    ...config,
    url: 'https://replacement.test',
    apiKey: 'synthetic-replacement-key',
    proxyHeaders: [{ name: 'X-Proxy-Owner', value: 'replacement' }],
  };
  function setup(waitForCacheOnMutate: boolean, activeConfig = config) {
    let dispatch!: () => void;
    const gate = new Promise<void>((resolve) => {
      dispatch = resolve;
    });
    const client = new QueryClient({
      mutationCache: new MutationCache({
        ...(waitForCacheOnMutate ? { onMutate: () => gate } : {}),
      }),
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const seedOwner = () => {
      client.setQueryData(['userProfile'], { id: 'owner' });
      client.setQueryData(['serverConfigs'], { activeConfig });
    };
    seedOwner();
    client.setQueryData(['meals', 'recipeImportSource', scope, 'meal'], source);
    jest.mocked(fetchRecipeSource).mockResolvedValue(null);
    const resolveActive = jest
      .spyOn(storage, 'getActiveServerConfig')
      .mockResolvedValue(replacement);
    const fetch = jest
      .fn<ReturnType<typeof global.fetch>, Parameters<typeof global.fetch>>()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);
    global.fetch = fetch;
    jest
      .mocked(syncRecipeNutrition)
      .mockImplementation(
        jest.requireActual<
          typeof import('../../src/services/api/recipeImportApi')
        >('../../src/services/api/recipeImportApi').syncRecipeNutrition
      );
    const hook = renderHook(() => useRecipeSource('meal', scope), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    return { client, hook, dispatch, fetch, resolveActive, seedOwner };
  }

  it.each([
    [false, 'profile'],
    [false, 'server'],
    [false, 'clear-and-repopulate'],
    [true, 'profile'],
    [true, 'server'],
    [true, 'clear-and-repopulate'],
  ] as const)(
    'rejects a %s cache-onMutate delay / %s owner change before sending',
    async (delay, change) => {
      const { client, hook, dispatch, fetch, resolveActive, seedOwner } =
        setup(delay);
      let pending!: Promise<unknown>;
      act(() => {
        pending = hook.result.current.sync
          .mutateAsync()
          .catch((error) => error);
        if (change === 'profile')
          client.setQueryData(['userProfile'], { id: 'replacement-owner' });
        if (change === 'server')
          client.setQueryData(['serverConfigs'], { activeConfig: replacement });
        if (change === 'clear-and-repopulate') {
          client.clear();
          seedOwner();
        }
      });
      expect(fetch).not.toHaveBeenCalled();
      await act(async () => {
        dispatch();
        expect(await pending).toEqual(new Error('OWNER_REQUIRED'));
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(resolveActive).not.toHaveBeenCalled();
      expect(hook.result.current.sync.isSuccess).toBe(false);
      expect(hook.result.current.sync.error).toBeNull();
      hook.unmount();
      expect(client.getQueryCache().hasListeners()).toBe(false);
      client.clear();
    }
  );

  it.each(['apiKey', 'session'] as const)(
    'binds the initiating %s connection through errors and a fresh retry',
    async (authType) => {
      const activeConfig = {
        ...config,
        authType,
        sessionToken: 'synthetic-owner-session',
      };
      const { client, hook, dispatch, fetch, resolveActive } = setup(
        true,
        activeConfig
      );
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ error: 'Ingredients changed.' }),
      } as Response);
      const onError = jest.fn();
      const onSuccess = jest.fn();
      let pending!: Promise<unknown>;
      act(() => {
        pending = hook.result.current.sync
          .mutateAsync(undefined, { onError })
          .catch((error) => error);
        client.setQueryData(['userProfile'], { id: 'owner', name: 'Updated' });
      });
      await act(async () => {
        dispatch();
        expect(await pending).toEqual(
          expect.objectContaining({ message: 'Ingredients changed.' })
        );
      });
      await waitFor(() =>
        expect(hook.result.current.sync.error?.message).toBe(
          'Ingredients changed.'
        )
      );
      expect(onError).toHaveBeenCalledWith(
        expect.any(ApiError),
        undefined,
        expect.anything(),
        expect.anything()
      );
      await act(async () => {
        await hook.result.current.sync.mutateAsync(undefined, { onSuccess });
      });
      await waitFor(() =>
        expect(hook.result.current.sync.isSuccess).toBe(true)
      );
      expect(onSuccess).toHaveBeenCalledWith(
        response,
        undefined,
        expect.anything(),
        expect.anything()
      );
      expect(fetch).toHaveBeenCalledTimes(2);
      for (const call of fetch.mock.calls)
        expect(call).toEqual([
          'https://example.test/api/v2/recipe-imports/meal/sync-nutrition',
          expect.objectContaining({
            method: 'POST',
            body: '{}',
            headers: expect.objectContaining({
              Authorization: `Bearer ${authType === 'session' ? activeConfig.sessionToken : activeConfig.apiKey}`,
              'X-Proxy-Owner': 'original',
            }),
          }),
        ]);
      expect(resolveActive).not.toHaveBeenCalled();
      hook.unmount();
      expect(client.getQueryCache().hasListeners()).toBe(false);
      client.clear();
    }
  );
});

it.each(['clear', 'profile', 'server', 'same-owner', 'unmount'] as const)(
  'guards source sync against synchronous %s events and supports a fresh retry',
  async (change) => {
    for (const failure of [false, true]) {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const scope = 'server:https://example.test:owner';
      const key = ['meals', 'recipeImportSource', scope, 'meal'];
      const source = {
        ...preview,
        mealId: 'meal',
        mappings: [],
        mealFingerprint: 'base',
        syncEligible: true,
        lastSyncedAt: null,
      };
      const response = {
        status: 'synced' as const,
        source: { ...source, lastSyncedAt: '2026-11-09T10:00:00Z' },
      };
      const seedOwner = () => {
        client.setQueryData(['userProfile'], { id: 'owner' });
        client.setQueryData(['serverConfigs'], {
          activeConfig: { id: 'server', url: 'https://example.test' },
        });
      };
      seedOwner();
      client.setQueryData(key, source);
      jest
        .mocked(fetchRecipeSource)
        .mockImplementation(() => new Promise(() => {}));
      let finish!: (value: typeof response) => void;
      let fail!: (error: Error) => void;
      jest.mocked(syncRecipeNutrition).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = resolve;
            fail = reject;
          })
      );
      const hook = renderHook(() => useRecipeSource('meal', scope), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      });
      act(() => hook.result.current.sync.mutate());
      await waitFor(() => expect(finish).toBeDefined());
      const mutation = client.getMutationCache().getAll()[0]!;
      act(() => {
        if (change === 'clear') client.clear();
        if (change === 'profile')
          client.setQueryData(['userProfile'], { id: 'other' });
        if (change === 'server')
          client.setQueryData(['serverConfigs'], {
            activeConfig: { id: 'server', url: 'https://replacement.test' },
          });
        if (change === 'same-owner') {
          seedOwner();
          client.setQueryData(['userProfile'], {
            id: 'owner',
            name: 'New name',
          });
        }
      });
      if (change === 'same-owner')
        await act(async () => {
          await client.fetchQuery({
            queryKey: ['userProfile'],
            queryFn: async () => ({ id: 'owner', name: 'Refetched name' }),
            staleTime: 0,
          });
        });
      if (change === 'unmount') hook.unmount();
      await act(async () => {
        if (failure) fail(new Error('sync rejected'));
        else finish(response);
      });
      await waitFor(() =>
        expect(mutation.state.status).toBe(failure ? 'error' : 'success')
      );
      if (change === 'same-owner')
        await waitFor(() =>
          expect(hook.result.current.sync.status).toBe(
            failure ? 'error' : 'success'
          )
        );
      else {
        expect(client.getQueryData<typeof source>(key)?.lastSyncedAt).not.toBe(
          response.source.lastSyncedAt
        );
        if (change !== 'unmount') {
          expect(hook.result.current.sync.isSuccess).toBe(false);
          expect(hook.result.current.sync.error).toBeNull();
        }
      }
      if (change !== 'unmount') {
        act(() => {
          seedOwner();
          client.setQueryData(key, source);
        });
        jest.mocked(syncRecipeNutrition).mockResolvedValue(response);
        for (let retry = 0; retry < 2; retry += 1) {
          await act(async () => {
            await hook.result.current.sync.mutateAsync();
          });
          await waitFor(() =>
            expect(hook.result.current.sync.isSuccess).toBe(true)
          );
          expect(client.getQueryData<typeof source>(key)?.lastSyncedAt).toBe(
            response.source.lastSyncedAt
          );
        }
        hook.unmount();
      }
      expect(client.getQueryCache().hasListeners()).toBe(false);
      client.clear();
    }
  }
);
it('processes every unresolved ingredient in batches of at most twenty without overwriting a late manual confirmation', async () => {
  let resolveFirst: (
    value: Awaited<ReturnType<typeof suggestRecipe>>
  ) => void = () => {};
  suggest.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
  );
  suggest.mockResolvedValue({ ingredients: [], aiUsed: true, warnings: [] });
  const { result } = renderHook(
    () => useRecipeImport(preview, 'owner-server'),
    { wrapper: Wrapper }
  );
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = result.current.suggest(true);
  });
  act(() => result.current.confirm(mapping));
  await act(async () => {
    resolveFirst({
      ingredients: [
        { ingredientId: 'rice-0', candidates: [], suggestedCandidateId: null },
      ],
      aiUsed: true,
      warnings: [],
    });
    await pending;
  });
  expect(
    suggest.mock.calls.map(([request]) => request.ingredientIds?.length)
  ).toEqual([20, 3]);
  expect(suggest.mock.calls[1][0].confirmedIngredientIds).toEqual(['rice-0']);
  expect(result.current.suggestions).toEqual([]);
  expect(result.current.mappings['rice-0']).toEqual(mapping);
  expect(result.current.progress).toEqual({ done: 23, total: 23 });
});
it('discards pending suggestions and clears private draft state after a source or account change', async () => {
  let finish: (
    value: Awaited<ReturnType<typeof suggestRecipe>>
  ) => void = () => {};
  suggest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { result, rerender } = renderHook(
    ({ scope, source }) => useRecipeImport(source, scope),
    {
      wrapper: Wrapper,
      initialProps: { scope: 'owner-server' as string | null, source: preview },
    }
  );
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = result.current.suggest(false);
    result.current.confirm(mapping);
  });
  rerender({
    scope: null,
    source: { ...preview, sourceFingerprint: 'b'.repeat(64) },
  });
  await act(async () => {
    finish({
      ingredients: [
        { ingredientId: 'rice-0', candidates: [], suggestedCandidateId: null },
      ],
      aiUsed: false,
      warnings: [],
    });
    await pending;
  });
  expect(result.current.mappings).toEqual({});
  expect(result.current.suggestions).toEqual([]);
  await act(async () => result.current.suggest(true));
  expect(suggest).toHaveBeenCalledTimes(1);
});
it('requires all confirmations and sends cooked whole grams independently of ingredient quantities, saving only once', async () => {
  const one = { ...preview, ingredients: [preview.ingredients[0]] };
  save.mockResolvedValue({
    mealId: 'meal',
    source: {
      ...one,
      mealId: 'meal',
      mappings: [mapping],
      mealFingerprint: 'base',
      syncEligible: true,
      lastSyncedAt: null,
    },
    nutrition: { calories: 2400 },
    servingSize: 450,
    servingUnit: 'g',
    totalServings: 4,
  });
  const { result } = renderHook(() => useRecipeImport(one, 'owner-server'), {
    wrapper: Wrapper,
  });
  await act(async () => {
    await expect(
      result.current.save({ name: 'Rice batch', finishedWeightGrams: 1800 })
    ).rejects.toThrow();
  });
  expect(save).not.toHaveBeenCalled();
  act(() => result.current.confirm(mapping));
  await act(async () => {
    await result.current.save({
      name: 'Rice batch',
      finishedWeightGrams: 1800,
    });
  });
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ finishedWeightGrams: 1800, mappings: [mapping] })
  );
  await act(async () => {
    await result.current.save({
      name: 'Rice batch',
      finishedWeightGrams: 1800,
    });
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(result.current.saved?.mealId).toBe('meal');
});

it.each([false, true])(
  'does not apply an older save settlement to a reopened review (failure: %s)',
  async (failure) => {
    const one = { ...preview, ingredients: [preview.ingredients[0]] };
    const response = {
      mealId: 'old-meal',
      source: {
        ...one,
        mealId: 'old-meal',
        mappings: [mapping],
        mealFingerprint: 'base',
        syncEligible: true,
        lastSyncedAt: null,
      },
      nutrition: { calories: 2400 },
      servingSize: 450,
      servingUnit: 'g',
      totalServings: 4,
    };
    let finishOld!: (value: typeof response) => void;
    let failOld!: (error: Error) => void;
    let finishNew!: (value: typeof response) => void;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finishOld = resolve;
          failOld = reject;
        })
    );
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNew = resolve;
        })
    );
    const { result, rerender } = renderHook(
      ({ source }) => useRecipeImport(source, 'owner-server'),
      { wrapper: Wrapper, initialProps: { source: one } }
    );
    act(() => result.current.confirm(mapping));
    let oldSave!: Promise<unknown>;
    act(() => {
      oldSave = result.current
        .save({ name: 'Old batch', servings: 4 })
        .catch((error) => error);
    });
    rerender({ source: { ...one, sourceFingerprint: 'b'.repeat(64) } });
    rerender({ source: one });
    act(() => result.current.confirm(mapping));
    let newSave!: Promise<unknown>;
    act(() => {
      newSave = result.current.save({ name: 'New batch', servings: 4 });
    });
    await act(async () => {
      if (failure) failOld(new Error('old response lost'));
      else finishOld(response);
      await oldSave;
    });
    expect(result.current.saving).toBe(true);
    expect(result.current.saved).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.uncertain).toBe(false);
    await act(async () => {
      finishNew({ ...response, mealId: 'new-meal' });
      await newSave;
    });
    expect(result.current.saving).toBe(false);
    expect(result.current.saved?.mealId).toBe('new-meal');
  }
);

it.each([
  'unmount-success',
  'network',
  'server',
  'validation',
  'scope-switch',
  'cache-clear',
  'late-identity-clear',
  'unmount-then-clear',
  'same-owner-refetch',
  'profile-replacement',
] as const)(
  'refreshes only retained owner meal caches after save outcome %s',
  async (outcome) => {
    const one = { ...preview, ingredients: [preview.ingredients[0]] };
    const response = {
      mealId: 'saved-meal',
      source: {
        ...one,
        mealId: 'saved-meal',
        mappings: [mapping],
        mealFingerprint: 'base',
        syncEligible: true,
        lastSyncedAt: null,
      },
      nutrition: { calories: 2400 },
      servingSize: 450,
      servingUnit: 'g',
      totalServings: 4,
    };
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const seedIdentity = () => {
      client.setQueryData(['userProfile'], { id: 'owner' });
      client.setQueryData(['serverConfigs'], {
        activeConfig: { id: 'server', url: 'https://example.test' },
      });
    };
    if (outcome !== 'late-identity-clear') seedIdentity();
    const listenersBefore = client.getQueryCache().hasListeners();
    const mealsKey = ['meals', 'library'];
    client.setQueryData(mealsKey, ['cached']);
    let finish: (value: typeof response) => void = () => {};
    let fail: (error: Error) => void = () => {};
    save.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        })
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount, rerender } = renderHook(
      ({ scope }) => useRecipeImport(one, scope),
      { wrapper, initialProps: { scope: 'server:https://example.test:owner' } }
    );
    act(() => result.current.confirm(mapping));
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current
        .save({ name: 'Batch', servings: 4 })
        .catch((error) => error);
    });
    if (outcome === 'unmount-success' || outcome === 'unmount-then-clear')
      unmount();
    if (outcome === 'same-owner-refetch') {
      client.setQueryData(['userProfile'], { id: 'owner', name: 'New name' });
      seedIdentity();
    }
    if (outcome === 'profile-replacement')
      client.setQueryData(['userProfile'], { id: 'other-owner' });
    if (outcome === 'scope-switch') rerender({ scope: 'other-owner' });
    if (outcome === 'late-identity-clear') seedIdentity();
    if (
      outcome === 'cache-clear' ||
      outcome === 'late-identity-clear' ||
      outcome === 'unmount-then-clear'
    ) {
      client.clear();
      client.setQueryData(mealsKey, ['new owner']);
      seedIdentity();
    }
    await act(async () => {
      if (outcome === 'network') fail(new Error('lost response'));
      else if (outcome === 'server' || outcome === 'validation')
        fail(new ApiError('failed', outcome === 'server' ? 500 : 400));
      else finish(response);
      await pending;
    });
    expect(client.getQueryCache().hasListeners()).toBe(listenersBefore);
    const shouldRefresh = [
      'unmount-success',
      'network',
      'server',
      'same-owner-refetch',
    ].includes(outcome);
    expect(client.getQueryState(mealsKey)?.isInvalidated).toBe(shouldRefresh);
    if (outcome !== 'validation' && outcome !== 'same-owner-refetch')
      expect(
        client.getQueryData([
          'meals',
          'recipeImportSource',
          'server:https://example.test:owner',
          'saved-meal',
        ])
      ).toBeUndefined();
    if (outcome === 'validation') {
      expect(result.current.saving).toBe(false);
      expect(result.current.uncertain).toBe(false);
      act(() => result.current.confirm({ ...mapping, quantity: 800 }));
      expect(result.current.mappings[mapping.ingredientId].quantity).toBe(800);
    }
    if (outcome === 'network' || outcome === 'server') {
      expect(result.current.saving).toBe(false);
      expect(result.current.uncertain).toBe(true);
      await act(async () => {
        await expect(
          result.current.save({ name: 'Batch', servings: 4 })
        ).rejects.toThrow(/Check your meals library/);
      });
      expect(save).toHaveBeenCalledTimes(1);
    }
    if (
      outcome === 'cache-clear' ||
      outcome === 'late-identity-clear' ||
      outcome === 'profile-replacement'
    ) {
      expect(result.current.saving).toBe(false);
      expect(result.current.saved).toBeNull();
      expect(result.current.uncertain).toBe(true);
      await act(async () => {
        await expect(
          result.current.save({ name: 'Batch', servings: 4 })
        ).rejects.toThrow(/Check your meals library/);
      });
      expect(save).toHaveBeenCalledTimes(1);
    }
  }
);
