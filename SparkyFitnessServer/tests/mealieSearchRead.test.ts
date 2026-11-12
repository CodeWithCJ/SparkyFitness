import { afterEach, describe, expect, it, vi } from 'vitest';
import MealieService from '../integrations/mealie/mealieService.js';
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
describe('shared Mealie recipe read and nutrition discovery', () => {
  it('validates food-search recipe details instead of trusting malformed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ slug: 'rice', nutrition: {} }))
        )
    );
    expect(
      await new MealieService(
        'https://recipe.example',
        'fixture'
      ).getRecipeDetails('rice')
    ).toBeNull();
  });
  it('encodes the same recipe read used by food details and ingredient import', async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            name: 'Rice',
            slug: 'rice / beans',
            recipeIngredient: [],
            nutrition: { calories: '0' },
          })
        )
      )
    );
    vi.stubGlobal('fetch', fetcher);
    const client = new MealieService('https://recipe.example', 'fixture');
    await client.getRecipeDetails('rice / beans');
    await client.getRecipeDetails('rice / beans', { requireIngredients: true });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
      Array(2).fill('https://recipe.example/api/recipes/rice%20%2F%20beans')
    );
    expect(
      fetcher.mock.calls.every(([, init]) => init.signal instanceof AbortSignal)
    ).toBe(true);
  });
  it.each([
    [undefined, false],
    [{ calories: '' }, false],
    [{ calories: 'unknown' }, false],
    [{ calories: '0' }, true],
    [{ fiberContent: '12.5 g' }, true],
    [{ id: '123' }, false],
  ])(
    'distinguishes absent nutrition from measured zero: %j',
    (nutrition, expected) => {
      const mapped = new MealieService(
        'https://recipe.example',
        'fixture'
      ).mapMealieRecipeToSparkyFood(
        { name: 'Rice', slug: 'rice', recipeServings: 4, nutrition },
        'owner'
      );
      expect(mapped.food.recipe_has_nutrition).toBe(expected);
      expect(mapped.food.recipe_servings).toBe(4);
    }
  );
});
