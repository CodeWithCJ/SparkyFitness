import { apiFetch } from '../../../src/services/api/apiClient';
import { ApiError } from '../../../src/services/api/errors';
import {
  browseRecipes,
  fetchRecipeSource,
  syncRecipeNutrition,
} from '../../../src/services/api/recipeImportApi';
jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));
const request = jest.mocked(apiFetch);
beforeEach(() => jest.resetAllMocks());
it('browses encoded recipe search using the authenticated API transport', async () => {
  request.mockResolvedValue({
    items: [],
    pagination: { page: 2, pageSize: 10, totalCount: 0, hasMore: false },
  });
  await browseRecipes('provider', 'rice & beans', 2);
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint:
        '/api/v2/recipe-imports/mealie/provider/recipes?search=rice+%26+beans&page=2',
    })
  );
});
it('treats ordinary nonimported meal source 404 as absent', async () => {
  request.mockRejectedValue(new ApiError('missing', 404));
  expect(await fetchRecipeSource('meal')).toBeNull();
});
it('preserves actionable conflict resolution text from nutrition sync', async () => {
  request.mockRejectedValue(
    new ApiError(
      'Server error',
      409,
      JSON.stringify({
        code: 'LOCAL_CHANGED',
        error: 'Ingredients changed. Reimport to a new base meal.',
      })
    )
  );
  await expect(syncRecipeNutrition('meal')).rejects.toThrow(
    'Ingredients changed. Reimport to a new base meal.'
  );
});
