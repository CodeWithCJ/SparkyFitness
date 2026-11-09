import '../hooks/queryTestUtils';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecipeImportScreen from '../../src/screens/RecipeImportScreen';
import { fetchExternalProviders } from '../../src/services/api/externalProvidersApi';
import {
  browseRecipes,
  previewRecipe,
} from '../../src/services/api/recipeImportApi';
import type { RootStackScreenProps } from '../../src/types/navigation';
let mockScope: string | null = 'server-owner';
jest.mock('../../src/hooks/useRecipeImport', () => ({
  ...jest.requireActual('../../src/hooks/useRecipeImport'),
  useRecipeImportAccess: () => mockScope,
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('../../src/services/api/externalProvidersApi', () => ({
  fetchExternalProviders: jest.fn(),
}));
jest.mock('../../src/services/api/recipeImportApi', () => ({
  browseRecipes: jest.fn(),
  previewRecipe: jest.fn(),
}));
const navigation = {} as RootStackScreenProps<'RecipeImport'>['navigation'];
const route = {
  key: 'import',
  name: 'RecipeImport' as const,
  params: undefined,
};
it.each([null, 'other-server-owner'])(
  'unmounts private source data and ignores a late preview when scope changes to %s',
  async (nextScope) => {
    jest.clearAllMocks();
    mockScope = 'server-owner';
    jest.mocked(fetchExternalProviders).mockResolvedValue([
      {
        id: 'provider',
        provider_name: 'Private Mealie',
        provider_type: 'mealie',
        is_active: true,
      },
    ]);
    jest.mocked(browseRecipes).mockResolvedValue({
      items: [
        {
          id: 'recipe',
          slug: 'private-rice',
          name: 'Private rice',
          recipeServings: 4,
        },
      ],
      pagination: { page: 1, pageSize: 10, totalCount: 1, hasMore: false },
    });
    let finish: (
      value: Awaited<ReturnType<typeof previewRecipe>>
    ) => void = () => {};
    jest.mocked(previewRecipe).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = () => (
      <QueryClientProvider client={client}>
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            frame: { x: 0, y: 0, width: 390, height: 844 },
          }}
        >
          <RecipeImportScreen navigation={navigation} route={route} />
        </SafeAreaProvider>
      </QueryClientProvider>
    );
    const screen = render(view());
    await waitFor(() =>
      expect(screen.getByText('Private Mealie')).toBeTruthy()
    );
    fireEvent.press(screen.getByText('Private Mealie'));
    await waitFor(() => expect(screen.getByText('Private rice')).toBeTruthy());
    fireEvent.press(screen.getByText('Private rice'));
    mockScope = nextScope;
    screen.rerender(view());
    await act(async () =>
      finish({
        providerId: 'provider',
        recipeSlug: 'private-rice',
        recipeId: 'recipe',
        name: 'Private rice',
        recipeServings: 4,
        sourceFingerprint: 'a'.repeat(64),
        ingredients: [],
        syncWarnings: [],
      })
    );
    expect(screen.queryByText('Private rice')).toBeNull();
    if (nextScope) {
      expect(
        await screen.findByRole('button', {
          name: 'Private Mealie',
          selected: false,
        })
      ).toBeTruthy();
      expect(screen.queryByPlaceholderText('Search Mealie recipes')).toBeNull();
      expect(browseRecipes).toHaveBeenCalledTimes(1);
    } else expect(screen.queryByText('Private Mealie')).toBeNull();
    if (!nextScope)
      expect(
        screen.getByText(
          'Switch to your own profile to import or sync recipes.'
        )
      ).toBeTruthy();
    expect(fetchExternalProviders).toHaveBeenCalledTimes(nextScope ? 2 : 1);
  }
);
