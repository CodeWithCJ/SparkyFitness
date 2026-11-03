import { afterEach, describe, expect, it, vi } from 'vitest';
import MealieService from '../integrations/mealie/mealieService.js';
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
    ).rejects.toThrow('Mealie nutrition update failed (403)');
  });
  it('does not turn a recipe read failure into an empty recipe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('error', { status: 500 }))
    );
    await expect(
      new MealieService(
        'https://recipe.example',
        'fixture'
      ).readIngredientRecipe('recipe')
    ).rejects.toThrow(/Mealie recipe read failed/);
  });
});
