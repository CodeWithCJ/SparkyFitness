import '../hooks/queryTestUtils';
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecipeImportSavedMappings from '../../src/components/recipeImport/RecipeImportSavedMappings';
import {
  listRecipeMappings,
  forgetRecipeMapping,
} from '../../src/services/api/recipeImportApi';
import {
  profileQueryKey,
  serverConfigsQueryKey,
} from '../../src/hooks/queryKeys';
jest.mock('../../src/services/api/recipeImportApi', () => ({
  listRecipeMappings: jest.fn(),
  forgetRecipeMapping: jest.fn(),
}));
const config = {
  id: 'server',
  url: 'https://example.test',
  apiKey: 'synthetic-test-key',
};
const scope = `${config.id}:${config.url}:owner`;
const id = '00000000-0000-4000-a000-000000000005';
const empty = {
  items: [],
  pagination: { page: 1, pageSize: 25, totalCount: 0, hasMore: false },
};
const data = {
  ...empty,
  items: [
    {
      id,
      foodId: '00000000-0000-4000-a000-000000000002',
      variantId: '00000000-0000-4000-a000-000000000003',
      foodName: 'Almonds',
      ingredientName: 'Anchovies',
      sourceUnit: 'lb',
      quantityPerSourceUnit: 0.05,
      unit: 'serving',
      updatedAt: '2026-11-12T00:00:00Z',
    },
  ],
  pagination: { ...empty.pagination, totalCount: 1 },
};
beforeEach(() => jest.resetAllMocks());
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(profileQueryKey, { id: 'owner' });
  client.setQueryData(serverConfigsQueryKey, { activeConfig: config });
  return render(
    <QueryClientProvider client={client}>
      <RecipeImportSavedMappings providerId="provider" scope={scope} />
    </QueryClientProvider>
  );
}
it('lists and forgets a previous choice on the owner connection while preserving existing meals', async () => {
  jest
    .mocked(listRecipeMappings)
    .mockResolvedValueOnce(data)
    .mockResolvedValue(empty);
  jest.mocked(forgetRecipeMapping).mockResolvedValue({ deleted: true });
  const screen = mount();
  expect(listRecipeMappings).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Manage saved choices'));
  expect(await screen.findByText('Anchovies → Almonds')).toBeTruthy();
  expect(screen.getByText('0.05 serving / 1 lb')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Forget saved choice for Anchovies'));
  await waitFor(() =>
    expect(forgetRecipeMapping).toHaveBeenCalledWith(
      'provider',
      id,
      expect.objectContaining(config)
    )
  );
  expect(
    await screen.findByText('No saved choices for this provider.')
  ).toBeTruthy();
});
it('keeps a saved choice visible when forgetting fails', async () => {
  jest.mocked(listRecipeMappings).mockResolvedValue(data);
  jest
    .mocked(forgetRecipeMapping)
    .mockRejectedValue(new Error('Could not forget this choice.'));
  const screen = mount();
  fireEvent.press(screen.getByText('Manage saved choices'));
  await screen.findByText('Anchovies → Almonds');
  fireEvent.press(screen.getByLabelText('Forget saved choice for Anchovies'));
  expect(await screen.findByText('Could not forget this choice.')).toBeTruthy();
  expect(screen.getByText('Anchovies → Almonds')).toBeTruthy();
});
