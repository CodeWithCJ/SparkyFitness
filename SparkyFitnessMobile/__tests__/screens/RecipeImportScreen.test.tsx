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
jest.mock('../../src/components/FoodImageSourceProvider', () => ({
  useFoodImageSourceContext: () => () => undefined,
}));
jest.mock('../../src/components/LightboxProvider', () => ({
  useOpenLightbox: () => jest.fn(),
}));
jest.mock('../../src/hooks/useEnergyUnit', () => ({
  useEnergyUnit: () => 'kcal',
}));
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
jest.mock('../../src/components/recipeImport/RecipeImportReview', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return (props: { preview: { name: string } }) =>
    React.createElement(Text, null, props.preview.name);
});
const navigation = {} as RootStackScreenProps<'RecipeImport'>['navigation'];
const route = {
  key: 'import',
  name: 'RecipeImport' as const,
  params: undefined,
};
it.each(['server-owner', 'stale-owner'])(
  'loads a direct import only for the retained owner (%s)',
  async (requestScope) => {
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
      items: [],
      pagination: { page: 1, pageSize: 10, totalCount: 0, hasMore: false },
    });
    jest.mocked(previewRecipe).mockResolvedValue({
      providerId: 'provider',
      recipeSlug: 'selected-rice',
      recipeId: 'recipe',
      name: 'Chosen recipe',
      recipeServings: 4,
      sourceFingerprint: 'a'.repeat(64),
      ingredients: [],
      syncWarnings: [],
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const screen = render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            frame: { x: 0, y: 0, width: 390, height: 844 },
          }}
        >
          <RecipeImportScreen
            navigation={navigation}
            route={{
              ...route,
              params: {
                providerId: 'provider',
                recipeSlug: 'selected-rice',
                scope: requestScope,
              },
            }}
          />
        </SafeAreaProvider>
      </QueryClientProvider>
    );
    if (requestScope === mockScope) {
      expect(await screen.findByText('Chosen recipe')).toBeTruthy();
      expect(previewRecipe).toHaveBeenCalledWith({
        providerId: 'provider',
        recipeSlug: 'selected-rice',
      });
    } else {
      expect(await screen.findByText('Private Mealie')).toBeTruthy();
      expect(previewRecipe).not.toHaveBeenCalled();
    }
  }
);
it('shows the existing food-search nutrition row before ingredient selection', async () => {
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
        id: null,
        slug: 'rice',
        name: 'Rice batch',
        recipeServings: 4,
        food: {
          name: 'Rice batch',
          brand: null,
          is_custom: true,
          provider_type: 'mealie',
          provider_external_id: 'rice',
          recipe_has_nutrition: true,
          default_variant: {
            serving_size: 1,
            serving_unit: 'serving',
            is_default: true,
            calories: 125,
            protein: 4,
            carbs: 20,
            fat: 3,
          },
        },
      },
    ],
    pagination: { page: 1, pageSize: 10, totalCount: 1, hasMore: false },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const screen = render(
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
  fireEvent.press(await screen.findByText('Private Mealie'));
  expect(await screen.findByText('125 kcal')).toBeTruthy();
  expect(screen.getByText('Protein 4 g · Carbs 20 g · Fat 3 g')).toBeTruthy();
  expect(screen.getByText('Recipe makes 4 servings')).toBeTruthy();
});
it('debounces a typed recipe name instead of searching each keystroke', async () => {
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
    items: [],
    pagination: { page: 1, pageSize: 10, totalCount: 0, hasMore: false },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
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
  fireEvent.press(await view.findByText('Private Mealie'));
  await waitFor(() => expect(browseRecipes).toHaveBeenCalledTimes(1));
  for (const value of ['c', 'ch', 'chi', 'chic', 'chick', 'chicke', 'chicken'])
    fireEvent.changeText(
      view.getByPlaceholderText('Search Mealie recipes'),
      value
    );
  expect(browseRecipes).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(browseRecipes).toHaveBeenLastCalledWith('provider', 'chicken', 1)
  );
  expect(browseRecipes).toHaveBeenCalledTimes(2);
});
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
