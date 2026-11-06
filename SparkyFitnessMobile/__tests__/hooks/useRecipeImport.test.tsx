import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  RecipeImportPreview,
  RecipeImportMapping,
} from '@workspace/shared';
import { useRecipeImport } from '../../src/hooks/useRecipeImport';
import {
  saveRecipe,
  suggestRecipe,
  fetchRecipeSource,
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
