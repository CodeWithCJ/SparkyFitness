import { apiCall } from '@/api/api';
import {
  listRecipeMappings,
  forgetRecipeMapping,
  browseRecipes,
} from '@/api/Foods/recipeImportService';
jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
  HttpApiError: class extends Error {},
}));
beforeEach(() => jest.resetAllMocks());
it('reuses normalized food search and retains recipe identity, servings and nutrients', async () => {
  jest.mocked(apiCall).mockResolvedValue({
    foods: [
      {
        name: 'Rice',
        brand: null,
        is_custom: true,
        provider_type: 'mealie',
        provider_external_id: 'rice / beans',
        recipe_servings: 4,
        recipe_has_nutrition: true,
        default_variant: {
          serving_size: 1,
          serving_unit: 'serving',
          is_default: true,
          calories: 123,
          protein: 4,
          carbs: 20,
          fat: 3,
        },
      },
    ],
    pagination: { page: 2, pageSize: 10, totalCount: 12, hasMore: false },
  });
  const result = await browseRecipes('provider', 'rice & beans', 2);
  expect(apiCall).toHaveBeenCalledWith(
    '/v2/foods/search/mealie',
    expect.objectContaining({
      params: expect.objectContaining({
        query: 'rice & beans',
        providerId: 'provider',
        page: '2',
      }),
    })
  );
  expect(result.items[0]).toMatchObject({
    slug: 'rice / beans',
    recipeServings: 4,
    food: { default_variant: { calories: 123 } },
  });
});
it('lists a bounded saved-mapping page through the existing authenticated transport', async () => {
  jest.mocked(apiCall).mockResolvedValue({
    items: [],
    pagination: { page: 2, pageSize: 25, totalCount: 0, hasMore: false },
  });
  const result = await listRecipeMappings('provider /', 2);
  expect(result.items).toEqual([]);
  expect(apiCall).toHaveBeenCalledWith(
    '/v2/recipe-imports/mealie/provider%20%2F/mappings',
    expect.objectContaining({ params: { page: 2 } })
  );
});
it('deletes only the encoded saved mapping without posting any nutrition or meal content', async () => {
  jest.mocked(apiCall).mockResolvedValue({ deleted: true });
  await forgetRecipeMapping('provider /', 'mapping /');
  expect(apiCall).toHaveBeenCalledWith(
    '/v2/recipe-imports/mealie/provider%20%2F/mappings/mapping%20%2F',
    expect.objectContaining({ method: 'DELETE' })
  );
  expect(apiCall).toHaveBeenCalledTimes(1);
});
