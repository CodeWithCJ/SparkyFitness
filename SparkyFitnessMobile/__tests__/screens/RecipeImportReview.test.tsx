import '../hooks/queryTestUtils';
import React from 'react';
import { Pressable, Text } from 'react-native';
import RecipeImportSourcePanel from '../../src/components/recipeImport/RecipeImportSourcePanel';
import { invalidateMealCaches } from '../../src/hooks/useMeals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  RecipeImportPreview,
  RecipeImportSource,
} from '@workspace/shared';
import RecipeImportReview from '../../src/components/recipeImport/RecipeImportReview';
import RecipeImportIngredientRow from '../../src/components/recipeImport/RecipeImportIngredientRow';
import {
  saveRecipe,
  syncRecipeNutrition,
  fetchRecipeSource,
  fetchRecipeFood,
} from '../../src/services/api/recipeImportApi';
import { fetchFoodVariants } from '../../src/services/api/foodsApi';
import { setPendingRecipeImportSelection } from '../../src/services/recipeImportSelection';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (callback: () => void) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(callback, [callback]),
}));
jest.mock('../../src/services/api/recipeImportApi', () => ({
  saveRecipe: jest.fn(),
  suggestRecipe: jest.fn(),
  fetchRecipeSource: jest.fn(),
  syncRecipeNutrition: jest.fn(),
  fetchRecipeFood: jest.fn(),
}));
jest.mock('../../src/services/api/foodsApi', () => ({
  fetchFoodVariants: jest.fn(),
}));
const foodId = '00000000-0000-4000-a000-000000000002';
const variantId = '00000000-0000-4000-a000-000000000003';
const mapping = {
  ingredientId: 'rice',
  foodId,
  variantId,
  quantity: 600,
  unit: 'g',
  confirmed: true as const,
};
const preview: RecipeImportPreview = {
  providerId: '00000000-0000-4000-a000-000000000001',
  recipeSlug: 'rice',
  recipeId: 'rice',
  name: 'Rice',
  recipeServings: 4,
  sourceFingerprint: 'a'.repeat(64),
  syncWarnings: [],
  ingredients: [
    {
      ingredientId: 'rice',
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
    },
  ],
};
const source: RecipeImportSource = {
  ...preview,
  mealId: 'meal',
  mappings: [mapping],
  mealFingerprint: 'base',
  syncEligible: true,
  lastSyncedAt: null,
};
const variant = {
  id: variantId,
  food_id: foodId,
  serving_size: 100,
  serving_unit: 'g',
  calories: 400,
  protein: 8,
  carbs: 80,
  fat: 2,
};

it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
  'keeps an incomplete endpoint variant editable and clears its warning after replacement (%s)',
  async (protein) => {
    // Saved variant endpoints can return null despite the older mobile interface.
    const incomplete = { ...variant, protein } as unknown as Awaited<
      ReturnType<typeof fetchFoodVariants>
    >[number];
    jest.mocked(fetchFoodVariants).mockResolvedValue([incomplete]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const choose = jest.fn();
    const row = {
      ...preview.ingredients[0],
      issues: ['incomplete_nutrition' as const],
      missingNutrients: ['protein', 'sodium'],
    };
    const view = (variantId: string) => (
      <QueryClientProvider client={client}>
        <RecipeImportIngredientRow
          ingredient={row}
          mapping={{ ...mapping, variantId }}
          scope="owner-server"
          disabled={false}
          onChoose={choose}
          onCandidate={jest.fn()}
        />
      </QueryClientProvider>
    );
    const screen = render(view(variantId));
    expect(await screen.findByText(/P \? g/)).toBeTruthy();
    expect(
      screen.getByText(
        'Core nutrition is incomplete. Choose a complete food variant.'
      )
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Choose food for Rice'));
    expect(choose).toHaveBeenCalledTimes(1);
    jest
      .mocked(fetchFoodVariants)
      .mockResolvedValue([{ ...variant, id: 'complete' }]);
    screen.rerender(view('complete'));
    expect(await screen.findByText(/P 8 g/)).toBeTruthy();
    expect(
      screen.queryByText(
        'Core nutrition is incomplete. Choose a complete food variant.'
      )
    ).toBeNull();
  }
);

it('describes optional unknown nutrients without a false core warning on a reused mapping', async () => {
  const screen = setup({
    ...preview,
    syncWarnings: ['incomplete_nutrition'],
    ingredients: [
      {
        ...preview.ingredients[0],
        mapping,
        mappingOrigin: 'saved',
        issues: ['incomplete_nutrition'],
        missingNutrients: ['sodium'],
      },
    ],
  });
  expect(await screen.findByText('Nutrient rice · Brand')).toBeTruthy();
  expect(
    screen.getByText(
      'Some optional nutrients are unknown. Known nutrition can still be used.'
    )
  ).toBeTruthy();
  expect(
    screen.queryByText(
      'Core nutrition is incomplete. Choose a complete food variant.'
    )
  ).toBeNull();
  expect(screen.queryByText('incomplete_nutrition')).toBeNull();
});
const navigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
} as unknown as RootStackScreenProps<'RecipeImport'>['navigation'];
function setup(value = preview) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RecipeImportReview
        preview={value}
        scope="owner-server"
        navigation={navigation}
        onBack={jest.fn()}
      />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchRecipeSource).mockResolvedValue(source);
  jest.mocked(fetchRecipeFood).mockResolvedValue({
    id: foodId,
    name: 'Nutrient rice',
    brand: 'Brand',
    is_custom: false,
    default_variant: variant,
  });
  jest.mocked(fetchFoodVariants).mockResolvedValue([variant]);
  jest.mocked(saveRecipe).mockResolvedValue({
    mealId: 'meal',
    source,
    nutrition: { calories: 2400 },
    servingSize: 450,
    servingUnit: 'g',
    totalServings: 4,
  });
});
it('hands off whole-recipe source quantity and retains the draft while the picker confirms a local food', async () => {
  const screen = setup();
  fireEvent.changeText(screen.getByLabelText('Meal name'), 'My batch');
  fireEvent.changeText(
    screen.getByLabelText(
      'Cooked whole dish without the pot, in grams (optional)'
    ),
    '1800'
  );
  fireEvent.press(screen.getByLabelText('Choose food for Rice'));
  const params = jest.mocked(navigation.navigate).mock
    .calls[0][1] as RootStackScreenProps<'FoodSearch'>['route']['params'];
  expect(params?.recipeImportTarget).toMatchObject({
    ingredientId: 'rice',
    quantity: 0.6,
    unit: 'kg',
  });
  expect(jest.mocked(saveRecipe)).not.toHaveBeenCalled();
  const target = params?.recipeImportTarget;
  if (!target) throw new Error('Missing picker target');
  act(() =>
    setPendingRecipeImportSelection(target, {
      food_id: foodId,
      variant_id: variantId,
      quantity: 600,
      unit: 'g',
      food_name: 'Nutrient rice',
      serving_size: 100,
      serving_unit: 'g',
      calories: 400,
      protein: 8,
      carbs: 80,
      fat: 2,
    })
  );
  fireEvent.changeText(screen.getByLabelText('Meal name'), 'My batch ready');
  await waitFor(() => expect(screen.getByText('Confirmed')).toBeTruthy());
  await waitFor(() =>
    expect(screen.getByText('Nutrient rice · Brand')).toBeTruthy()
  );
  expect(screen.getByDisplayValue('1800')).toBeTruthy();
  fireEvent.press(screen.getByText('Save reusable meal'));
  await waitFor(() =>
    expect(saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My batch ready',
        finishedWeightGrams: 1800,
        mappings: [mapping],
      })
    )
  );
});
it('preserves a successful saved meal and shows sync conflicts without a duplicate save', async () => {
  const screen = setup({
    ...preview,
    ingredients: [
      { ...preview.ingredients[0], mapping, mappingOrigin: 'saved' },
    ],
  });
  jest
    .mocked(syncRecipeNutrition)
    .mockRejectedValue(
      new Error('Source changed. Preview again before syncing.')
    );
  fireEvent.press(screen.getByText('Save reusable meal'));
  await waitFor(() => expect(screen.getByText('Open saved meal')).toBeTruthy());
  fireEvent.press(screen.getByText('Sync nutrition to Mealie'));
  await waitFor(() =>
    expect(
      screen.getByText('Source changed. Preview again before syncing.')
    ).toBeTruthy()
  );
  expect(screen.getByText('Open saved meal')).toBeTruthy();
  expect(saveRecipe).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('Open saved meal'));
  expect(navigation.replace).toHaveBeenCalledWith('MealDetail', {
    mealId: 'meal',
  });
});

it('updates the rendered source sync eligibility after a normal meal edit invalidates caches', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const screen = render(
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId="meal" scope="owner-server" />
      <Pressable onPress={() => invalidateMealCaches(client, 'meal')}>
        <Text>Save ordinary edit</Text>
      </Pressable>
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.getByText('Sync nutrition to Mealie')).toBeTruthy()
  );
  jest
    .mocked(fetchRecipeSource)
    .mockResolvedValue({ ...source, syncEligible: false });
  fireEvent.press(screen.getByText('Save ordinary edit'));
  await waitFor(() =>
    expect(
      screen.getByText(
        'This meal is for tracking only. Reimport the original recipe with complete, unchanged amounts to enable nutrition sync.'
      )
    ).toBeTruthy()
  );
  fireEvent.press(screen.getByText('Sync nutrition to Mealie'));
  expect(syncRecipeNutrition).not.toHaveBeenCalled();
});

it('does not restore a departed owner source cache when a pending sync finishes after unmount', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let finish: (
    value: Awaited<ReturnType<typeof syncRecipeNutrition>>
  ) => void = () => {};
  jest.mocked(syncRecipeNutrition).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const screen = render(
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId="meal" scope="old-owner-server" />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.getByText('Sync nutrition to Mealie')).toBeTruthy()
  );
  fireEvent.press(screen.getByText('Sync nutrition to Mealie'));
  await waitFor(() => expect(syncRecipeNutrition).toHaveBeenCalledTimes(1));
  screen.unmount();
  client.clear();
  await act(async () =>
    finish({
      status: 'synced',
      source: { ...source, lastSyncedAt: '2026-11-04T09:00:00Z' },
    })
  );
  expect(
    client.getQueryData([
      'meals',
      'recipeImportSource',
      'old-owner-server',
      'meal',
    ])
  ).toBeUndefined();
});

it('requires explicit recipe servings when the source yield is missing instead of inventing one serving', async () => {
  jest.mocked(saveRecipe).mockResolvedValue({
    mealId: 'meal',
    source: {
      ...source,
      recipeServings: null,
      syncEligible: false,
      syncWarnings: ['missing_servings'],
    },
    nutrition: { calories: 2400 },
    servingSize: 1,
    servingUnit: 'serving',
    totalServings: 4,
  });
  const screen = setup({
    ...preview,
    recipeServings: null,
    syncWarnings: ['missing_servings'],
    ingredients: [
      { ...preview.ingredients[0], mapping, mappingOrigin: 'saved' },
    ],
  });
  expect(screen.getByLabelText('Recipe servings').props.value).toBe('');
  expect(screen.getByText('Save reusable meal')).toBeDisabled();
  expect(screen.queryByText('missing_servings')).toBeNull();
  expect(
    screen.getByText(
      'The source has no recipe servings. Enter servings to save for tracking; nutrition sync remains unavailable.'
    )
  ).toBeTruthy();
  fireEvent.press(screen.getByText('Save reusable meal'));
  expect(saveRecipe).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Recipe servings'), '4');
  expect(screen.getByText('Save reusable meal')).toBeEnabled();
  fireEvent.press(screen.getByText('Save reusable meal'));
  await waitFor(() =>
    expect(saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ servings: 4 })
    )
  );
  await waitFor(() => expect(screen.getByText('Open saved meal')).toBeTruthy());
  fireEvent.press(screen.getByText('Sync nutrition to Mealie'));
  expect(syncRecipeNutrition).not.toHaveBeenCalled();
});

it('does not show a previous meal sync outcome when the detail route changes meal', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let finish: (
    value: Awaited<ReturnType<typeof syncRecipeNutrition>>
  ) => void = () => {};
  jest.mocked(syncRecipeNutrition).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = (mealId: string) => (
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId={mealId} scope="owner-server" />
    </QueryClientProvider>
  );
  const screen = render(view('meal'));
  await waitFor(() =>
    expect(screen.getByText('Sync nutrition to Mealie')).toBeTruthy()
  );
  fireEvent.press(screen.getByText('Sync nutrition to Mealie'));
  await waitFor(() => expect(syncRecipeNutrition).toHaveBeenCalledTimes(1));
  jest.mocked(fetchRecipeSource).mockResolvedValue({
    ...source,
    mealId: 'other-meal',
    name: 'Other batch',
  });
  screen.rerender(view('other-meal'));
  await waitFor(() => expect(screen.getByText('Other batch')).toBeTruthy());
  await act(async () => finish({ status: 'synced', source }));
  expect(screen.queryByText('Nutrition synced to Mealie.')).toBeNull();
});
