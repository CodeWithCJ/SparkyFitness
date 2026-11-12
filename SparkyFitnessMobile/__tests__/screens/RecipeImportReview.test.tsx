import '../hooks/queryTestUtils';
import React from 'react';
import { Pressable, Text } from 'react-native';
import RecipeImportSourcePanel from '../../src/components/recipeImport/RecipeImportSourcePanel';
import RecipeImportSyncConfirmation from '../../src/components/recipeImport/RecipeImportSyncConfirmation';
import { useEnergyUnit } from '../../src/hooks/useEnergyUnit';
import { invalidateMealCaches } from '../../src/hooks/useMeals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  RecipeImportPreview,
  RecipeImportSource,
  RecipeImportSyncPreview,
} from '@workspace/shared';
import RecipeImportReview from '../../src/components/recipeImport/RecipeImportReview';
import RecipeImportIngredientRow from '../../src/components/recipeImport/RecipeImportIngredientRow';
import {
  saveRecipe,
  syncRecipeNutrition,
  fetchRecipeSource,
  fetchRecipeFood,
  previewRecipeNutritionSync,
} from '../../src/services/api/recipeImportApi';
import { fetchFoodVariants } from '../../src/services/api/foodsApi';
import { setPendingRecipeImportSelection } from '../../src/services/recipeImportSelection';
import type { RootStackScreenProps } from '../../src/types/navigation';
import type { ServerConfig } from '../../src/services/storage';
import {
  profileQueryKey,
  serverConfigsQueryKey,
} from '../../src/hooks/queryKeys';

const ownerConfig: ServerConfig = {
  id: 'test-server',
  url: 'https://example.test',
  apiKey: 'synthetic-test-key',
};
const ownerScope = `${ownerConfig.id}:${ownerConfig.url}:owner`;
function seedRecipeOwner(client: QueryClient): void {
  client.setQueryData(profileQueryKey, { id: 'owner' });
  client.setQueryData(serverConfigsQueryKey, { activeConfig: ownerConfig });
}

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
  previewRecipeNutritionSync: jest.fn(async (mealId: string) => ({
    ...mockSyncPreview,
    mealId,
  })),
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
const mockSyncPreview: RecipeImportSyncPreview = {
  mealId: 'meal',
  mealName: 'Saved rice',
  recipeName: 'Current Mealie recipe',
  recipeSlug: 'rice',
  recipeServings: 4,
  sourceChanged: true,
  existingNutrition: { calories: 100 },
  batchNutrition: { calories: 2400 },
  nutrition: { calories: 600, protein: 15, carbs: 90, fat: 15 },
  confirmationFingerprint: 'c'.repeat(64),
};
async function confirmNutritionSync(screen: ReturnType<typeof render>) {
  fireEvent.press(await screen.findByText('Sync nutrition to Mealie'));
  await waitFor(() =>
    expect(screen.getByText('Confirm nutrition sync')).toBeEnabled()
  );
  fireEvent.press(screen.getByText('Confirm nutrition sync'));
}
async function confirmSavedChoice(screen: ReturnType<typeof render>) {
  const button = await screen.findByText('Confirm saved choice');
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.press(button);
}

it('shows partial optional writes, skipped reasons and the saved-meal date in native confirmation', () => {
  const screen = render(
    <RecipeImportSyncConfirmation
      preview={
        {
          ...mockSyncPreview,
          nutrition: {
            ...mockSyncPreview.nutrition,
            dietary_fiber: 6.25,
            sodium: null,
            potassium: 25,
          },
          nutritionCoverage: { dietary_fiber: { known: 1, total: 2 } },
          mealSavedAt: '2026-11-11T17:00:00Z',
        } as RecipeImportSyncPreview
      }
      loading={false}
      busy={false}
      error={null}
      onCancel={jest.fn()}
      onConfirm={jest.fn()}
      onRefresh={jest.fn()}
    />
  );
  expect(screen.getByText('Dietary fiber')).toBeTruthy();
  expect(screen.getByText('6.25 g')).toBeTruthy();
  expect(screen.getByText('Partial: 1/2 values known')).toBeTruthy();
  expect(
    screen.getAllByText('Skipped: no known ingredient values.').length
  ).toBeGreaterThan(0);
  expect(screen.getByText('Potassium — not supported by Mealie.')).toBeTruthy();
  expect(screen.getByText(/Last saved:/).props.children).toContain('2026');
  expect(
    screen.getByText(
      /replace the affected ingredient using its corrected food variant/
    )
  ).toBeTruthy();
});

it('shows an unconfirmed saved suggestion with confirm and forget actions on native', async () => {
  const confirm = jest.fn();
  const forget = jest.fn(async () => true);
  const screen = render(
    <QueryClientProvider client={new QueryClient()}>
      <RecipeImportIngredientRow
        ingredient={{
          ...preview.ingredients[0]!,
          mapping,
          mappingOrigin: 'saved',
          savedMappingId: '00000000-0000-4000-a000-000000000005',
        }}
        scope={ownerScope}
        disabled={false}
        onChoose={jest.fn()}
        onCandidate={jest.fn()}
        onConfirm={confirm}
        onForgetSavedMapping={forget}
      />
    </QueryClientProvider>
  );
  expect(
    await screen.findByText('Suggested from a previous import')
  ).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByText('Confirm saved choice')).toBeEnabled()
  );
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Confirm saved choice'));
  expect(confirm).toHaveBeenCalledWith(mapping);
  fireEvent.press(screen.getByText('Forget saved choice'));
  await waitFor(() =>
    expect(forget).toHaveBeenCalledWith('00000000-0000-4000-a000-000000000005')
  );
  await waitFor(() =>
    expect(screen.queryByText('Suggested from a previous import')).toBeNull()
  );
  expect(saveRecipe).not.toHaveBeenCalled();
});
it('warns that an amount-like note may need its own ingredient mapping on native', () => {
  const screen = render(
    <QueryClientProvider client={new QueryClient()}>
      <RecipeImportIngredientRow
        ingredient={{
          ...preview.ingredients[0]!,
          note: '1 Cup Flour',
          noteNeedsReview: true,
        }}
        scope={ownerScope}
        disabled={false}
        onChoose={jest.fn()}
        onCandidate={jest.fn()}
      />
    </QueryClientProvider>
  );
  expect(
    screen.getByText(
      'This note starts with an amount and may describe another ingredient. Review it separately before saving.'
    )
  ).toBeTruthy();
});
it('keeps the original spoon amount readable beside the selected food amount', () => {
  const client = new QueryClient();
  const screen = render(
    <QueryClientProvider client={client}>
      <RecipeImportIngredientRow
        ingredient={{
          ...preview.ingredients[0]!,
          originalQuantity: 1,
          quantity: 5,
          unit: 'ml',
          originalUnit: 'tsp',
        }}
        scope={ownerScope}
        disabled={false}
        onChoose={jest.fn()}
        onCandidate={jest.fn()}
      />
    </QueryClientProvider>
  );
  expect(screen.getByText('Original whole-recipe amount: 1 tsp')).toBeTruthy();
  expect(screen.getByText('Selected food and amount')).toBeTruthy();
});

it('previews the changed Mealie recipe and cancels without writing nutrition', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seedRecipeOwner(client);
  jest.mocked(fetchRecipeSource).mockResolvedValue(source);
  jest
    .mocked(syncRecipeNutrition)
    .mockResolvedValue({ status: 'synced', source });
  const screen = render(
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId="meal" scope={ownerScope} />
    </QueryClientProvider>
  );
  fireEvent.press(await screen.findByText('Sync nutrition to Mealie'));
  expect(await screen.findByText('Review nutrition sync')).toBeTruthy();
  expect(await screen.findByText('Current Mealie recipe')).toBeTruthy();
  expect(syncRecipeNutrition).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Cancel'));
  expect(screen.queryByText('Review nutrition sync')).toBeNull();
  expect(syncRecipeNutrition).not.toHaveBeenCalled();
});
it('confirms the reviewed nutrition once using the original owner connection', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seedRecipeOwner(client);
  let finish!: () => void;
  jest.mocked(syncRecipeNutrition).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ status: 'synced', source });
      })
  );
  const screen = render(
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId="meal" scope={ownerScope} />
    </QueryClientProvider>
  );
  fireEvent.press(await screen.findByText('Sync nutrition to Mealie'));
  await waitFor(() =>
    expect(screen.getByText('Confirm nutrition sync')).toBeEnabled()
  );
  fireEvent.press(screen.getByText('Confirm nutrition sync'));
  fireEvent.press(screen.getByText('Confirm nutrition sync'));
  await waitFor(() => expect(syncRecipeNutrition).toHaveBeenCalledTimes(1));
  expect(syncRecipeNutrition).toHaveBeenCalledWith(
    'meal',
    ownerConfig,
    'c'.repeat(64)
  );
  await act(async () => finish());
  expect(await screen.findByText('Nutrition synced to Mealie.')).toBeTruthy();
});
it('discards a pending private nutrition preview on owner replacement', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seedRecipeOwner(client);
  let finish!: (value: RecipeImportSyncPreview) => void;
  jest.mocked(previewRecipeNutritionSync).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const screen = render(
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId="meal" scope={ownerScope} />
    </QueryClientProvider>
  );
  fireEvent.press(await screen.findByText('Sync nutrition to Mealie'));
  await waitFor(() => expect(finish).toBeDefined());
  act(() => client.setQueryData(profileQueryKey, { id: 'other-owner' }));
  await act(async () => finish(mockSyncPreview));
  expect(screen.queryByText('Current Mealie recipe')).toBeNull();
  expect(screen.queryByText('Review nutrition sync')).toBeNull();
  expect(syncRecipeNutrition).not.toHaveBeenCalled();
});
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

it('retries failed details for the unchanged food and keeps saving disabled until recovery', async () => {
  let recover!: (food: Awaited<ReturnType<typeof fetchRecipeFood>>) => void;
  jest
    .mocked(fetchRecipeFood)
    .mockRejectedValueOnce(new Error('temporarily unavailable'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          recover = resolve;
        })
    );
  const screen = setup({
    ...preview,
    ingredients: [
      { ...preview.ingredients[0], mapping, mappingOrigin: 'saved' },
    ],
  });
  expect(
    await screen.findByText(/Food details could not be loaded\./)
  ).toBeTruthy();
  fireEvent.press(screen.getByText('Save reusable meal'));
  expect(saveRecipe).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Retry'));
  await waitFor(() => expect(fetchRecipeFood).toHaveBeenCalledTimes(2));
  expect(fetchRecipeFood).toHaveBeenNthCalledWith(1, foodId);
  expect(fetchRecipeFood).toHaveBeenNthCalledWith(2, foodId);
  fireEvent.press(screen.getByText('Save reusable meal'));
  expect(saveRecipe).not.toHaveBeenCalled();
  await act(async () =>
    recover({
      id: foodId,
      name: 'Recovered rice',
      brand: null,
      is_custom: false,
      default_variant: variant,
    })
  );
  expect(await screen.findByText('Recovered rice')).toBeTruthy();
  await confirmSavedChoice(screen);
  fireEvent.press(screen.getByText('Save reusable meal'));
  await waitFor(() => expect(saveRecipe).toHaveBeenCalledTimes(1));
  expect(saveRecipe).toHaveBeenCalledWith(
    expect.objectContaining({ mappings: [mapping] })
  );
});
const navigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
} as unknown as RootStackScreenProps<'RecipeImport'>['navigation'];
function setup(value = preview) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  seedRecipeOwner(client);
  return render(
    <QueryClientProvider client={client}>
      <RecipeImportReview
        preview={value}
        scope={ownerScope}
        navigation={navigation}
        onBack={jest.fn()}
      />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useEnergyUnit).mockReturnValue('kcal');
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
  await confirmSavedChoice(screen);
  jest
    .mocked(syncRecipeNutrition)
    .mockRejectedValue(
      new Error('Source changed. Preview again before syncing.')
    );
  await waitFor(() =>
    expect(screen.getByText('Save reusable meal')).toBeEnabled()
  );
  fireEvent.press(screen.getByText('Save reusable meal'));
  await waitFor(() => expect(screen.getByText('Open saved meal')).toBeTruthy());
  await confirmNutritionSync(screen);
  await waitFor(() =>
    expect(
      screen.getByText('Source changed. Preview again before syncing.')
    ).toBeTruthy()
  );
  expect(screen.getByText('Open saved meal')).toBeTruthy();
  expect(saveRecipe).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('Cancel'));
  fireEvent.press(screen.getByText('Open saved meal'));
  expect(navigation.replace).toHaveBeenCalledWith('MealDetail', {
    mealId: 'meal',
  });
});

it.each([
  {
    warning: 'incomplete_nutrition',
    missingNutrients: ['sodium'],
    eligible: true,
  },
  {
    warning: 'incompatible_unit',
    missingNutrients: [],
    eligible: false,
  },
  {
    warning: 'missing_servings',
    missingNutrients: [],
    eligible: false,
  },
  {
    warning: 'incomplete_nutrition',
    missingNutrients: ['protein'],
    eligible: false,
  },
])(
  'uses authoritative saved-meal eligibility instead of stale import warning $warning',
  async ({ warning, missingNutrients, eligible }) => {
    jest.mocked(fetchRecipeSource).mockResolvedValue({
      ...source,
      syncWarnings: [warning],
      ingredients: [{ ...source.ingredients[0], missingNutrients }],
      syncEligible: eligible,
    });
    jest
      .mocked(syncRecipeNutrition)
      .mockResolvedValue({ status: 'synced', source });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    seedRecipeOwner(client);
    const screen = render(
      <QueryClientProvider client={client}>
        <RecipeImportSourcePanel mealId="meal" scope={ownerScope} />
      </QueryClientProvider>
    );
    expect(
      await screen.findByText(
        eligible
          ? 'Review and confirm the current saved meal nutrition before updating Mealie. Diary changes are separate.'
          : 'Review the saved meal ingredients and complete their nutrition before syncing.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(warning)).toBeNull();
    const button = screen.getByText('Sync nutrition to Mealie');
    if (eligible) expect(button).toBeEnabled();
    else expect(button).toBeDisabled();
    fireEvent.press(button);
    if (eligible) {
      await waitFor(() =>
        expect(screen.getByText('Confirm nutrition sync')).toBeEnabled()
      );
      fireEvent.press(screen.getByText('Confirm nutrition sync'));
      await waitFor(() => expect(syncRecipeNutrition).toHaveBeenCalledTimes(1));
      expect(syncRecipeNutrition).toHaveBeenCalledWith(
        'meal',
        ownerConfig,
        'c'.repeat(64)
      );
      expect(
        await screen.findByText('Nutrition synced to Mealie.')
      ).toBeTruthy();
    } else expect(syncRecipeNutrition).not.toHaveBeenCalled();
  }
);

it('updates the rendered source sync eligibility after a normal meal edit invalidates caches', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seedRecipeOwner(client);
  const screen = render(
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId="meal" scope={ownerScope} />
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
        'Review the saved meal ingredients and complete their nutrition before syncing.'
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
  seedRecipeOwner(client);
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
      <RecipeImportSourcePanel mealId="meal" scope={ownerScope} />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.getByText('Sync nutrition to Mealie')).toBeTruthy()
  );
  await confirmNutritionSync(screen);
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
    client.getQueryData(['meals', 'recipeImportSource', ownerScope, 'meal'])
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
      'Enter servings for the saved meal. To sync nutrition later, set a positive serving count in Mealie and refresh the nutrition preview.'
    )
  ).toBeTruthy();
  fireEvent.press(screen.getByText('Save reusable meal'));
  expect(saveRecipe).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Recipe servings'), '4');
  await confirmSavedChoice(screen);
  await waitFor(() =>
    expect(screen.getByText('Save reusable meal')).toBeEnabled()
  );
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
  seedRecipeOwner(client);
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
      <RecipeImportSourcePanel mealId={mealId} scope={ownerScope} />
    </QueryClientProvider>
  );
  const screen = render(view('meal'));
  await waitFor(() =>
    expect(screen.getByText('Sync nutrition to Mealie')).toBeTruthy()
  );
  await confirmNutritionSync(screen);
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

it.each(
  ['calories', 'protein', 'carbs', 'fat'].flatMap((nutrient) =>
    [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY].map(
      (value) => ({ nutrient, value })
    )
  )
)(
  'blocks the rendered Save for invalid $nutrient ($value), retaining editable mapping',
  async ({ nutrient, value }) => {
    jest
      .mocked(fetchFoodVariants)
      .mockResolvedValue([
        { ...variant, [nutrient]: value } as unknown as Awaited<
          ReturnType<typeof fetchFoodVariants>
        >[number],
      ]);
    const screen = setup({
      ...preview,
      ingredients: [
        { ...preview.ingredients[0], mapping, mappingOrigin: 'saved' },
      ],
    });
    expect(
      await screen.findByText(
        'Core nutrition is incomplete. Choose a complete food variant.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Save reusable meal')).toBeDisabled();
    expect(screen.getByLabelText('Choose food for Rice')).toBeEnabled();
    fireEvent.press(screen.getByText('Save reusable meal'));
    expect(saveRecipe).not.toHaveBeenCalled();
  }
);
it('allows measured zero and unknown optional nutrients after raw nutrition loads', async () => {
  jest.mocked(fetchFoodVariants).mockResolvedValue([
    {
      ...variant,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      sodium: undefined,
    },
  ]);
  const screen = setup({
    ...preview,
    ingredients: [
      { ...preview.ingredients[0], mapping, mappingOrigin: 'saved' },
    ],
  });
  expect(screen.getByText('Save reusable meal')).toBeDisabled();
  expect(await screen.findByText(/P 0 g/)).toBeTruthy();
  await confirmSavedChoice(screen);
  expect(screen.getByText('Save reusable meal')).toBeEnabled();
});
it('shows mapped and candidate energy in kJ while keeping raw kcal unchanged', async () => {
  jest.mocked(useEnergyUnit).mockReturnValue('kJ');
  const candidate = {
    candidateId: 'candidate',
    name: 'Candidate rice',
    brand: null,
    source: 'local' as const,
    foodId,
    variantId,
    servingSize: 100,
    servingUnit: 'g',
    nutrition: { calories: 100, protein: 8, carbs: 80, fat: 2 },
    nutritionComplete: true,
    unitCompatible: true,
    missingNutrients: [],
    providerType: null,
    providerId: null,
    providerExternalId: null,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const screen = render(
    <QueryClientProvider client={client}>
      <RecipeImportIngredientRow
        ingredient={preview.ingredients[0]}
        mapping={mapping}
        scope="owner-server"
        disabled={false}
        onChoose={jest.fn()}
        onCandidate={jest.fn()}
      />
      <RecipeImportIngredientRow
        ingredient={preview.ingredients[0]}
        suggestion={{
          ingredientId: 'rice',
          candidates: [candidate],
          suggestedCandidateId: null,
        }}
        scope="owner-server"
        disabled={false}
        onChoose={jest.fn()}
        onCandidate={jest.fn()}
      />
    </QueryClientProvider>
  );
  expect(await screen.findByText(/1,674 kJ/)).toBeTruthy();
  expect(screen.getByText(/418 kJ/)).toBeTruthy();
  expect(variant.calories).toBe(400);
});
it('localizes source warnings and exposes the chosen portion mode', () => {
  const screen = setup({ ...preview, syncWarnings: ['missing_quantity'] });
  expect(screen.queryByText('missing_quantity')).toBeNull();
  expect(
    screen.getByText(
      'Source quantity is missing. Enter the whole-recipe amount.'
    )
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Cooked grams', selected: true })
  ).toBeTruthy();
  fireEvent.press(screen.getByText('Servings only'));
  expect(
    screen.getByRole('button', { name: 'Servings only', selected: true })
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Cooked grams', selected: false })
  ).toBeTruthy();
});
