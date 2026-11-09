import React from 'react';
import { ApiError } from '../../src/services/api/errors';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  RecipeImportPreview,
  RecipeImportMapping,
} from '@workspace/shared';
import {
  useRecipeImport,
  useRecipeSource,
} from '../../src/hooks/useRecipeImport';
import {
  saveRecipe,
  suggestRecipe,
  fetchRecipeSource,
  syncRecipeNutrition,
} from '../../src/services/api/recipeImportApi';

jest.mock('../../src/services/api/recipeImportApi', () => ({
  saveRecipe: jest.fn(),
  suggestRecipe: jest.fn(),
  fetchRecipeSource: jest.fn(),
  syncRecipeNutrition: jest.fn(),
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
      expect(result.current.uncertain).toBe(false);
      act(() => result.current.confirm({ ...mapping, quantity: 800 }));
      expect(result.current.mappings[mapping.ingredientId].quantity).toBe(800);
    }
    if (outcome === 'network' || outcome === 'server') {
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
