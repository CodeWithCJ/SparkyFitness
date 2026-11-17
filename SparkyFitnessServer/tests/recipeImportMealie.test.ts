import { afterEach, describe, expect, it, vi } from 'vitest';
import MealieService from '../integrations/mealie/mealieService.js';
import { log } from '../config/logging.js';
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
describe('Mealie targeted ingredient transport', () => {
  it('writes only nutrition and preserves unrelated nutrient fields', async () => {
    const fake = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          slug: 'recipe',
          name: 'Recipe',
          recipeIngredient: [],
          nutrition: { calories: '600', sodiumContent: '12' },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fake);
    const adapter = new MealieService('https://recipe.example', 'fixture');
    await adapter.patchRecipeNutrition(
      'recipe',
      { calories: '600' },
      { sodiumContent: '12' }
    );
    expect(fake).toHaveBeenCalledOnce();
    const [url, request] = fake.mock.calls[0];
    expect(url).toBe('https://recipe.example/api/recipes/recipe');
    expect(request.method).toBe('PATCH');
    expect(JSON.parse(request.body)).toEqual({
      nutrition: { sodiumContent: '12', calories: '600' },
    });
  });
  it('fails honestly on rejected writes without exposing the upstream body', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('private upstream details', { status: 403 })
        )
    );
    await expect(
      new MealieService(
        'https://recipe.example',
        'fixture'
      ).patchRecipeNutrition('recipe', { calories: '600' }, {})
    ).rejects.toMatchObject({
      message: 'Mealie nutrition update failed (403)',
    });
  });
  it('does not turn a recipe read failure into an empty recipe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('error', { status: 500 }))
    );
    await expect(
      new MealieService('https://recipe.example', 'fixture').getRecipeDetails(
        'recipe',
        { requireIngredients: true }
      )
    ).rejects.toThrow(/Mealie recipe read failed/);
  });
});
describe('sanitized ingredient operation failures', () => {
  const operations = [
    {
      operation: 'recipe read',
      call: (adapter: MealieService) =>
        adapter.getRecipeDetails('private-slug', { requireIngredients: true }),
    },
    {
      operation: 'recipe search',
      call: (adapter: MealieService) =>
        adapter.searchRecipes('private-search', 1),
    },
    {
      operation: 'nutrition update',
      call: (adapter: MealieService) =>
        adapter.patchRecipeNutrition('private-slug', { calories: '600' }, {}),
    },
  ];
  for (const operation of operations) {
    it.each(['transport', 'http', 'schema'] as const)(
      `${operation.operation} reports only safe %s failure details`,
      async (failure) => {
        vi.mocked(log).mockClear();
        const fetcher = vi.fn();
        if (failure === 'transport')
          fetcher.mockRejectedValue(
            new Error('private-token https://private.example/?key=secret')
          );
        else
          fetcher.mockResolvedValue(
            new Response(
              failure === 'http'
                ? 'private-body'
                : JSON.stringify({ private: 'private-body' }),
              { status: failure === 'http' ? 403 : 200 }
            )
          );
        vi.stubGlobal('fetch', fetcher);
        const result = operation.call(
          new MealieService('https://private.example', 'private-token')
        );
        if (operation.operation === 'recipe search')
          await expect(result).resolves.toEqual({
            items: [],
            pagination: {
              page: 1,
              pageSize: 10,
              totalCount: 0,
              hasMore: false,
            },
          });
        else
          await expect(result).rejects.toMatchObject({
            message: `Mealie ${operation.operation} failed${failure === 'http' ? ' (403)' : ''}`,
          });
        expect(log).toHaveBeenCalledExactlyOnceWith(
          'error',
          'Mealie ingredient request failed',
          {
            operation: operation.operation,
            status:
              failure === 'transport' ? null : failure === 'http' ? 403 : 200,
            failure,
          }
        );
      }
    );
  }
});
