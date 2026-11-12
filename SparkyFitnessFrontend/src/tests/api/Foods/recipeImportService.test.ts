import { apiCall } from '@/api/api';
import {
  listRecipeMappings,
  forgetRecipeMapping,
} from '@/api/Foods/recipeImportService';
jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
  HttpApiError: class extends Error {},
}));
beforeEach(() => jest.resetAllMocks());
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
