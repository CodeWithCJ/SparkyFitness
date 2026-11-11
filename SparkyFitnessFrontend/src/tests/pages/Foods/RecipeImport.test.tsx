import '@testing-library/jest-dom';
import type { ComponentProps } from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Food, FoodVariant } from '@/types/food';
import type {
  RecipeImportPreview,
  RecipeImportSaveResponse,
} from '@workspace/shared';
import RecipeImportDialog from '@/pages/Foods/RecipeImportDialog';
import RecipeImportSourcePanel from '@/pages/Foods/RecipeImportSourcePanel';
import RecipeImportIngredientRow from '@/pages/Foods/RecipeImportIngredientRow';
import RecipeImportNutritionPreview from '@/pages/Foods/RecipeImportNutritionPreview';
import * as service from '@/api/Foods/recipeImportService';
import { HttpApiError } from '@/api/api';
import { useMeals } from '@/hooks/Foods/useMeals';
import { getMeals } from '@/api/Foods/meals';
import { useMealInvalidation } from '@/hooks/useInvalidateKeys';
import { useRecipeImport } from '@/hooks/Foods/useRecipeImport';
import { useRecipeImportFoodAccess } from '@/hooks/Foods/useRecipeImportQueries';
import { getFoodById, getFoodDetailsV2 } from '@/api/Foods/foodService';

let mockActing = false;
let mockOwner = 'owner';
let mockRealSelector = false;
let mockEnergyUnit: 'kcal' | 'kJ' = 'kcal';
let mockChosenVariant: FoodVariant | undefined;
let mockVariants: FoodVariant[] = [mockFoodVariant()];
function mockFoodVariant() {
  return {
    id: 'variant',
    serving_size: 100,
    serving_unit: 'g',
    calories: 400,
    protein: 10,
    carbs: 60,
    fat: 10,
  };
}
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    isActingOnBehalf: mockActing,
    activeUserId: mockOwner,
  }),
}));
jest.mock('@/api/Foods/recipeImportService');
jest.mock('@/api/Foods/meals', () => ({ getMeals: jest.fn() }));
jest.mock('@/api/Settings/externalProviderService', () => ({
  getExternalDataProviders: jest.fn(async () => [
    {
      id: 'provider',
      provider_type: 'mealie',
      provider_name: 'My Mealie',
      is_active: true,
      user_id: 'owner',
    },
  ]),
}));
const mockFood: Food = {
  id: 'food',
  name: 'Dry rice',
  brand: 'Test brand',
  is_custom: false,
  default_variant: {
    id: 'variant',
    serving_size: 100,
    serving_unit: 'g',
    calories: 400,
    protein: 10,
    carbs: 60,
    fat: 10,
  },
};
jest.mock('@/api/Foods/foodService', () => ({
  getFoodById: jest.fn(async () => mockFood),
  getFoodDetailsV2: jest.fn(),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    energyUnit: mockEnergyUnit,
    convertEnergy: (value: number) =>
      mockEnergyUnit === 'kJ' ? value * 4.184 : value,
    getEnergyUnitString: (unit: string) => unit,
    aiAssistedConversions: false,
    timezone: 'UTC',
  }),
}));
jest.mock('@/hooks/AI/useAIServiceSettings', () => ({
  useActiveAIService: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/hooks/AI/useUserAiConfigAllowed', () => ({
  useUserAiConfigAllowed: () => ({ data: false, isLoading: false }),
}));
jest.mock('@/hooks/Foods/useFoodVariants', () => ({
  foodVariantsOptions: (foodId: string) => ({
    queryKey: ['food-variants', foodId],
    queryFn: async () => mockVariants,
  }),
  useCreateFoodVariantMutation: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
}));
jest.mock('@/components/FoodSearch/FoodSearchDialog', () => ({
  __esModule: true,
  default: ({
    open,
    onFoodSelect,
  }: {
    open: boolean;
    onFoodSelect: (food: Food, type: 'food') => void;
  }) =>
    open ? (
      <button onClick={() => onFoodSelect(mockFood, 'food')}>
        Choose dry rice
      </button>
    ) : null,
}));
jest.mock('@/components/FoodUnitSelector', () => ({
  __esModule: true,
  default: (
    props: ComponentProps<
      typeof import('@/components/FoodUnitSelector').default
    >
  ) => {
    if (mockRealSelector) {
      const Actual = jest.requireActual<
        typeof import('@/components/FoodUnitSelector')
      >('@/components/FoodUnitSelector').default;
      return <Actual {...props} />;
    }
    return props.open ? (
      <button
        onClick={() =>
          props.onSelect(
            props.food,
            600,
            mockChosenVariant?.serving_unit ?? 'g',
            mockChosenVariant ?? props.food.default_variant!
          )
        }
      >
        Confirm 600 g
      </button>
    ) : null;
  },
}));
jest.mock('@/components/FoodSearch/FoodFormDialog', () => ({
  FoodFormDialog: ({
    editingProduct,
    onSave,
  }: {
    editingProduct: Food;
    onSave: (food: Food) => void;
  }) => (
    <button onClick={() => onSave(mockFood)}>
      Import exact {editingProduct.name}
    </button>
  ),
}));

const preview: RecipeImportPreview = {
  providerId: 'provider',
  recipeSlug: 'rice',
  recipeId: 'recipe',
  name: 'Rice batch',
  recipeServings: 4,
  sourceFingerprint: 'a'.repeat(64),
  syncWarnings: [],
  ingredients: [
    {
      ingredientId: 'rice',
      sourceFoodKey: 'opaque',
      name: 'Rice',
      originalText: '600 g rice',
      note: '',
      quantity: 600,
      unit: 'g',
      originalUnit: 'grams',
      issues: [],
      missingNutrients: [],
      mapping: null,
      mappingOrigin: null,
    },
  ],
};
const saved: RecipeImportSaveResponse = {
  mealId: 'meal',
  source: {
    ...preview,
    mealId: 'meal',
    mappings: [],
    mealFingerprint: 'base',
    syncEligible: true,
    lastSyncedAt: null,
  },
  nutrition: { calories: 2400, protein: 60, carbs: 360, fat: 60 },
  servingSize: 450,
  servingUnit: 'g',
  totalServings: 4,
};
const api = jest.mocked(service);
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RecipeImportDialog
          open
          onOpenChange={jest.fn()}
          onOpenMeal={jest.fn()}
        />
      </QueryClientProvider>
    ),
  };
}
async function selectRecipe() {
  await screen.findByRole('option', { name: 'My Mealie' });
  fireEvent.change(await screen.findByLabelText('Mealie provider'), {
    target: { value: 'provider' },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Rice batch' }));
  await screen.findByRole('button', { name: 'Save meal' });
}
async function mapRice() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose food for Rice' }));
  fireEvent.click(screen.getByText('Choose dry rice'));
  fireEvent.click(await screen.findByText('Confirm 600 g'));
  await screen.findByText(/Dry rice/);
}
async function confirmNutritionSync() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Sync nutrition to Mealie' })
  );
  const confirm = await screen.findByRole('button', {
    name: 'Confirm nutrition sync',
  });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
}
it('keeps the original spoon amount readable beside the selected food amount', () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <RecipeImportIngredientRow
        ingredient={{
          ...preview.ingredients[0]!,
          originalQuantity: 1,
          quantity: 5,
          unit: 'ml',
          originalUnit: 'tsp',
        }}
        onConfirm={jest.fn()}
      />
    </QueryClientProvider>
  );
  expect(
    screen.getByText('Original whole-recipe amount: 1 tsp')
  ).toBeInTheDocument();
  expect(screen.getByText('Selected food and amount')).toBeInTheDocument();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockActing = false;
  mockOwner = 'owner';
  mockRealSelector = false;
  mockEnergyUnit = 'kcal';
  mockChosenVariant = undefined;
  mockVariants = [mockFoodVariant()];
  jest.mocked(getFoodById).mockResolvedValue(mockFood);
  api.browseRecipes.mockResolvedValue({
    items: [
      { id: 'recipe', slug: 'rice', name: 'Rice batch', recipeServings: 4 },
    ],
    pagination: { page: 1, pageSize: 10, totalCount: 1, hasMore: false },
  });
  api.previewRecipe.mockResolvedValue(preview);
  api.saveRecipe.mockResolvedValue(saved);
  api.getRecipeSource.mockResolvedValue(saved.source);
  api.previewRecipeNutritionSync.mockImplementation(async (mealId) => ({
    mealId,
    mealName: 'Saved rice',
    recipeName: 'Rice',
    recipeSlug: 'rice',
    recipeServings: 4,
    sourceChanged: false,
    existingNutrition: {},
    batchNutrition: { calories: 2400 },
    nutrition: { calories: 600 },
    confirmationFingerprint: 'c'.repeat(64),
  }));
  api.suggestRecipe.mockResolvedValue({
    ingredients: [],
    aiUsed: true,
    warnings: [],
  });
});
it('selects a recipe, requires a manual mapping and saves whole cooked grams separately from ingredient amounts', async () => {
  setup();
  await selectRecipe();
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
  await mapRice();
  fireEvent.change(
    screen.getByLabelText('Finished cooked weight (g, optional)'),
    { target: { value: '1800' } }
  );
  fireEvent.blur(screen.getByLabelText('Finished cooked weight (g, optional)'));
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  await screen.findByText('Meal saved. You can log portions from your diary.');
  expect(api.saveRecipe).toHaveBeenCalledWith(
    expect.objectContaining({
      finishedWeightGrams: 1800,
      servings: 4,
      mappings: [
        expect.objectContaining({
          quantity: 600,
          unit: 'g',
          foodId: 'food',
          variantId: 'variant',
          confirmed: true,
        }),
      ],
    })
  );
  expect(screen.getByRole('button', { name: 'Open saved meal' })).toBeEnabled();
});
it('shows missing source amounts and blocks saving until the amount is explicitly confirmed', async () => {
  api.previewRecipe.mockResolvedValue({
    ...preview,
    ingredients: [
      {
        ...preview.ingredients[0]!,
        quantity: null,
        issues: ['missing_quantity'],
      },
    ],
  });
  setup();
  await selectRecipe();
  expect(
    screen.getByText(
      'Source quantity is missing. Enter the whole-recipe amount.'
    )
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
  await mapRice();
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled();
});
it('shows the structured original whole-recipe amount even when source text has no quantity', async () => {
  api.previewRecipe.mockResolvedValue({
    ...preview,
    ingredients: [
      {
        ...preview.ingredients[0]!,
        originalText: 'Rice from source',
        quantity: 1250.5,
      },
    ],
  });
  setup();
  await selectRecipe();
  expect(screen.getByText('Rice from source')).toBeInTheDocument();
  expect(
    screen.getByText(
      `Original whole-recipe amount: ${(1250.5).toLocaleString()} grams`
    )
  ).toBeInTheDocument();
});
it('preserves a kg ingredient amount through manual selection in the real unit selector', async () => {
  mockRealSelector = true;
  api.previewRecipe.mockResolvedValue({
    ...preview,
    ingredients: [
      {
        ...preview.ingredients[0]!,
        quantity: 0.6,
        unit: 'kg',
        originalUnit: 'kilograms',
      },
    ],
  });
  setup();
  await selectRecipe();
  fireEvent.click(screen.getByRole('button', { name: 'Choose food for Rice' }));
  fireEvent.click(screen.getByText('Choose dry rice'));
  const quantity = await screen.findByLabelText(
    'Quantity',
    {},
    { timeout: 10000 }
  );
  await waitFor(() => expect(quantity).toHaveValue('600'));
  fireEvent.click(screen.getByRole('button', { name: 'Update Food' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save meal' }));
  await waitFor(() =>
    expect(api.saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        mappings: [
          expect.objectContaining({
            quantity: 600,
            unit: 'g',
            foodId: 'food',
            variantId: 'variant',
          }),
        ],
      })
    )
  );
});
it('requires an explicit mass amount for a volume ingredient in the real unit selector', async () => {
  mockRealSelector = true;
  api.previewRecipe.mockResolvedValue({
    ...preview,
    ingredients: [
      {
        ...preview.ingredients[0]!,
        quantity: 250,
        unit: 'ml',
        originalUnit: 'milliliters',
      },
    ],
  });
  setup();
  await selectRecipe();
  fireEvent.click(screen.getByRole('button', { name: 'Choose food for Rice' }));
  fireEvent.click(screen.getByText('Choose dry rice'));
  const quantity = await screen.findByLabelText(
    'Quantity',
    {},
    { timeout: 10000 }
  );
  expect(quantity).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Update Food' })).toBeDisabled();
  expect(
    screen.getByText(
      'Enter the whole-recipe amount in g or provide an explicit unit conversion. The source amount is not converted across incompatible units.'
    )
  ).toBeInTheDocument();
  fireEvent.change(quantity, { target: { value: '200' } });
  fireEvent.blur(quantity);
  fireEvent.click(screen.getByRole('button', { name: 'Update Food' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save meal' }));
  await waitFor(() =>
    expect(api.saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        mappings: [expect.objectContaining({ quantity: 200, unit: 'g' })],
      })
    )
  );
});
it('previews whole-recipe nutrients when a confirmed mapping uses kg with a gram food variant', async () => {
  api.previewRecipe.mockResolvedValue({
    ...preview,
    ingredients: [
      {
        ...preview.ingredients[0]!,
        mapping: {
          ingredientId: 'rice',
          foodId: 'food',
          variantId: 'variant',
          quantity: 0.6,
          unit: 'kg',
          confirmed: true,
        },
        mappingOrigin: 'saved',
      },
    ],
  });
  setup();
  await selectRecipe();
  expect(
    await screen.findByText(
      `${(2400).toLocaleString()} kcal · P 60 g · C 360 g · F 60 g`
    )
  ).toBeInTheDocument();
});
it('keeps a manual confirmation when late AI results arrive and never auto-confirms suggestions', async () => {
  let finish!: (
    value: Awaited<ReturnType<typeof service.suggestRecipe>>
  ) => void;
  api.suggestRecipe.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  setup();
  await selectRecipe();
  fireEvent.click(screen.getByRole('button', { name: 'Suggest with AI' }));
  await mapRice();
  await act(async () =>
    finish({
      ingredients: [
        {
          ingredientId: 'rice',
          candidates: [
            {
              candidateId: 'other',
              source: 'local',
              foodId: 'other',
              variantId: 'other',
              name: 'Wrong rice',
              brand: null,
              servingSize: 100,
              servingUnit: 'g',
              nutrition: { calories: 1, protein: 1, carbs: 1, fat: 1 },
              nutritionComplete: true,
              unitCompatible: true,
            },
          ],
          suggestedCandidateId: 'other',
        },
      ],
      aiUsed: true,
      warnings: [],
    })
  );
  expect(screen.queryByText(/Wrong rice/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  await waitFor(() =>
    expect(api.saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        mappings: [expect.objectContaining({ foodId: 'food' })],
      })
    )
  );
});
it('processes every unresolved ingredient in bounded batches with progress', async () => {
  api.previewRecipe.mockResolvedValue({
    ...preview,
    ingredients: Array.from({ length: 45 }, (_, i) => ({
      ...preview.ingredients[0]!,
      ingredientId: `row-${i}`,
      name: `Rice ${i}`,
    })),
  });
  setup();
  await selectRecipe();
  fireEvent.click(screen.getByRole('button', { name: 'Suggest with AI' }));
  await waitFor(() => expect(api.suggestRecipe).toHaveBeenCalledTimes(3));
  expect(
    api.suggestRecipe.mock.calls.map(
      ([request]) => request.ingredientIds?.length
    )
  ).toEqual([20, 20, 5]);
  expect(
    await screen.findByText('Suggestions reviewed: 45 / 45')
  ).toBeInTheDocument();
});
it('keeps suggested candidates unconfirmed until the user reviews an exact provider import and amount', async () => {
  const exactFood: Food = {
    ...mockFood,
    id: 'external-rice',
    name: 'Provider rice',
  };
  jest.mocked(getFoodDetailsV2).mockResolvedValue(exactFood);
  api.suggestRecipe.mockResolvedValue({
    ingredients: [
      {
        ingredientId: 'rice',
        candidates: [
          {
            candidateId: 'external-candidate',
            source: 'external',
            providerType: 'usda',
            providerExternalId: 'exact-rice-id',
            providerId: 'nutrient-provider',
            name: 'Provider rice',
            brand: 'Exact brand',
            servingSize: 100,
            servingUnit: 'g',
            nutrition: { calories: 400, protein: 10, carbs: 60, fat: 10 },
            nutritionComplete: true,
            unitCompatible: true,
          },
        ],
        suggestedCandidateId: 'external-candidate',
      },
    ],
    aiUsed: true,
    warnings: [],
  });
  setup();
  await selectRecipe();
  fireEvent.click(screen.getByRole('button', { name: 'Suggest with AI' }));
  const review = await screen.findByRole('button', {
    name: 'Review Provider rice',
  });
  expect(screen.getByText('Suggested — review required')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
  fireEvent.click(review);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Import exact Provider rice' })
  );
  expect(getFoodDetailsV2).toHaveBeenCalledWith(
    'usda',
    'exact-rice-id',
    'nutrient-provider'
  );
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
  fireEvent.click(await screen.findByText('Confirm 600 g'));
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  await waitFor(() =>
    expect(api.saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        mappings: [
          expect.objectContaining({ foodId: 'food', variantId: 'variant' }),
        ],
      })
    )
  );
});
it('ignores late matching results after leaving and reopening a source recipe', async () => {
  let finish!: (
    value: Awaited<ReturnType<typeof service.suggestRecipe>>
  ) => void;
  api.suggestRecipe.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  setup();
  await selectRecipe();
  fireEvent.click(screen.getByRole('button', { name: 'Suggest with AI' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Choose another recipe' })
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rice batch' }));
  await screen.findAllByText('600 g rice');
  await act(async () =>
    finish({
      ingredients: [
        {
          ingredientId: 'rice',
          candidates: [
            {
              candidateId: 'stale',
              source: 'local',
              foodId: 'old',
              variantId: 'old',
              name: 'Stale rice',
              brand: null,
              servingSize: 100,
              servingUnit: 'g',
              nutrition: { calories: 1, protein: 1, carbs: 1, fat: 1 },
              nutritionComplete: true,
              unitCompatible: true,
            },
          ],
          suggestedCandidateId: 'stale',
        },
      ],
      aiUsed: true,
      warnings: [],
    })
  );
  expect(screen.queryByText(/Stale rice/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
});
it('does not submit twice or report sync success while the source write is pending', async () => {
  let finish!: (
    value: Awaited<ReturnType<typeof service.syncRecipeNutrition>>
  ) => void;
  api.syncRecipeNutrition.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  setup();
  await selectRecipe();
  await mapRice();
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  await confirmNutritionSync();
  expect(
    await screen.findByRole('button', { name: 'Syncing nutrition…' })
  ).toBeDisabled();
  expect(
    screen.queryByText('Nutrition synced to Mealie.')
  ).not.toBeInTheDocument();
  expect(api.syncRecipeNutrition).toHaveBeenCalledTimes(1);
  await act(async () =>
    finish({
      status: 'synced',
      source: { ...saved.source, lastSyncedAt: '2026-11-03T12:00:00Z' },
    })
  );
  expect(
    await screen.findByText('Nutrition synced to Mealie.')
  ).toBeInTheDocument();
  expect(api.saveRecipe).toHaveBeenCalledTimes(1);
});
it.each([
  'The saved meal or Mealie recipe changed. Refresh the nutrition preview and confirm the current values.',
  'Provider unavailable. Check Mealie before retrying.',
])('retains the saved local meal after sync failure: %s', async (message) => {
  api.syncRecipeNutrition.mockRejectedValue(new Error(message));
  setup();
  await selectRecipe();
  await mapRice();
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  await confirmNutritionSync();
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(
    screen.getByText('Meal saved. You can log portions from your diary.')
  ).toBeInTheDocument();
  expect(api.saveRecipe).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: 'Save meal' })
  ).not.toBeInTheDocument();
});
it('reports sync success only after the source confirms it', async () => {
  api.syncRecipeNutrition.mockResolvedValue({
    status: 'synced',
    source: { ...saved.source, lastSyncedAt: '2026-11-03T12:00:00Z' },
  });
  setup();
  await selectRecipe();
  await mapRice();
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  await confirmNutritionSync();
  expect(
    await screen.findByText('Nutrition synced to Mealie.')
  ).toBeInTheDocument();
});
it('unmounts retained private data and blocks queries while acting on behalf', async () => {
  const { rerender, client } = setup();
  await selectRecipe();
  mockActing = true;
  rerender(
    <QueryClientProvider client={client}>
      <RecipeImportDialog
        open
        onOpenChange={jest.fn()}
        onOpenMeal={jest.fn()}
      />
    </QueryClientProvider>
  );
  expect(screen.queryByText('600 g rice')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save meal' })
  ).not.toBeInTheDocument();
});
it('treats absent meal provenance as an ordinary meal without a sync action', async () => {
  api.getRecipeSource.mockResolvedValue(null);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId="ordinary" />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(api.getRecipeSource).toHaveBeenCalledWith('ordinary')
  );
  expect(
    screen.queryByRole('button', { name: 'Sync nutrition to Mealie' })
  ).not.toBeInTheDocument();
});

it('refreshes imported source eligibility after ordinary meal edit invalidation', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function OrdinaryMealEdit() {
    const invalidate = useMealInvalidation();
    return <button onClick={invalidate}>Save ordinary meal edit</button>;
  }
  render(
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId="meal" />
      <OrdinaryMealEdit />
    </QueryClientProvider>
  );
  expect(
    await screen.findByRole('button', { name: 'Sync nutrition to Mealie' })
  ).toBeEnabled();
  api.getRecipeSource.mockResolvedValue({
    ...saved.source,
    syncEligible: false,
  });
  fireEvent.click(screen.getByText('Save ordinary meal edit'));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Sync nutrition to Mealie' })
    ).toBeDisabled()
  );
});

it('does not restore a departed owner source cache after an in-flight sync finishes', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  let finish: (
    value: Awaited<ReturnType<typeof service.syncRecipeNutrition>>
  ) => void = () => {};
  api.syncRecipeNutrition.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const panel = render(
    <QueryClientProvider client={client}>
      <RecipeImportSourcePanel mealId="meal" />
    </QueryClientProvider>
  );
  await confirmNutritionSync();
  await waitFor(() => expect(api.syncRecipeNutrition).toHaveBeenCalledTimes(1));
  panel.unmount();
  client.clear();
  await act(async () =>
    finish({
      status: 'synced',
      source: { ...saved.source, lastSyncedAt: '2026-11-04T09:00:00Z' },
    })
  );
  expect(
    client.getQueryData(['meals', 'recipe-import-source', 'owner', 'meal'])
  ).toBeUndefined();
});

const reviewedMapping = {
  ingredientId: 'rice',
  foodId: 'food',
  variantId: 'variant',
  quantity: 600,
  unit: 'g',
  confirmed: true as const,
};
it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
  'keeps a nullable/nonfinite selected nutrient editable and recovers after replacement (%s)',
  async (protein) => {
    // The legacy Food interface is narrower than the nullable database endpoint.
    const incomplete = {
      ...mockFoodVariant(),
      protein,
    } as unknown as Food['default_variant'];
    jest
      .mocked(getFoodById)
      .mockResolvedValue({ ...mockFood, default_variant: incomplete });
    mockVariants = [incomplete!] as typeof mockVariants;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = (variantId: string) => (
      <QueryClientProvider client={client}>
        <RecipeImportIngredientRow
          ingredient={preview.ingredients[0]!}
          mapping={{ ...reviewedMapping, variantId }}
          onConfirm={jest.fn()}
        />
        <RecipeImportNutritionPreview
          mappings={[{ ...reviewedMapping, variantId }]}
          ingredientCount={1}
        />
      </QueryClientProvider>
    );
    const result = render(view('variant'));
    expect(await screen.findByText(/P \? g/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Core nutrition is incomplete. Choose a complete food variant.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Choose food for Rice' })
    ).toBeEnabled();
    expect(screen.queryByText(/2[,.]?400 kcal/)).not.toBeInTheDocument();
    mockVariants = [
      {
        ...mockFoodVariant(),
        id: 'complete',
        serving_description: 'Complete portion',
      },
    ];
    jest.mocked(getFoodById).mockResolvedValue(mockFood);
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['foods'] });
    });
    result.rerender(view('complete'));
    expect(
      await screen.findByText(
        `${(2400).toLocaleString()} kcal · P 60 g · C 360 g · F 60 g`
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Core nutrition is incomplete. Choose a complete food variant.'
      )
    ).not.toBeInTheDocument();
  }
);

it('loads a saved non-default mapping from the variant endpoint and shares it between row and totals', async () => {
  mockVariants = [
    {
      ...mockFoodVariant(),
      id: 'portion',
      serving_size: 200,
      serving_description: 'Named portion',
    },
  ];
  api.previewRecipe.mockResolvedValue({
    ...preview,
    ingredients: [
      {
        ...preview.ingredients[0]!,
        mapping: { ...reviewedMapping, variantId: 'portion' },
        mappingOrigin: 'saved',
      },
    ],
  });
  setup();
  await selectRecipe();
  expect(await screen.findByText('600 g · Named portion')).toBeInTheDocument();
  expect(
    await screen.findByText(
      `${(1200).toLocaleString()} kcal · P 30 g · C 180 g · F 30 g`
    )
  ).toBeInTheDocument();
  expect(getFoodById).toHaveBeenCalledTimes(1);
});

it('describes known optional gaps without claiming the selected core nutrition is incomplete', async () => {
  api.previewRecipe.mockResolvedValue({
    ...preview,
    syncWarnings: ['incomplete_nutrition'],
    ingredients: [
      {
        ...preview.ingredients[0]!,
        mapping: reviewedMapping,
        mappingOrigin: 'saved',
        issues: ['incomplete_nutrition'],
        missingNutrients: ['sodium'],
      },
    ],
  });
  setup();
  await selectRecipe();
  expect(
    await screen.findByText(
      'Some optional nutrients are unknown. Known nutrition can still be used.'
    )
  ).toBeInTheDocument();
  expect(
    screen.queryByText(
      'Core nutrition is incomplete. Choose a complete food variant.'
    )
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      'Review missing source amounts, units and servings below. Enter the whole-recipe amounts you will use for nutrition calculations.'
    )
  ).not.toBeInTheDocument();
  expect(
    await screen.findByText(
      `${(2400).toLocaleString()} kcal · P 60 g · C 360 g · F 60 g`
    )
  ).toBeInTheDocument();
});

it('keeps the source amount banner for a real missing source quantity', async () => {
  api.previewRecipe.mockResolvedValue({
    ...preview,
    syncWarnings: ['missing_quantity'],
    ingredients: [
      {
        ...preview.ingredients[0]!,
        quantity: null,
        issues: ['missing_quantity'],
      },
    ],
  });
  setup();
  await selectRecipe();
  expect(
    screen.getByText(
      'Review missing source amounts, units and servings below. Enter the whole-recipe amounts you will use for nutrition calculations.'
    )
  ).toBeInTheDocument();
});

it.each([false, true])(
  'does not refill the source cache after a pending save departs (%s)',
  async (departed) => {
    let finish: (value: RecipeImportSaveResponse) => void = () => {};
    api.saveRecipe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const panel = setup();
    await selectRecipe();
    await mapRice();
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
    await waitFor(() => expect(api.saveRecipe).toHaveBeenCalledTimes(1));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Saving meal…' })
    );
    if (departed) {
      panel.unmount();
      panel.client.clear();
    }
    await act(async () => finish(saved));
    await waitFor(() =>
      expect(
        panel.client.getQueryData([
          'meals',
          'recipe-import-source',
          'owner',
          'meal',
        ])
      ).toEqual(departed ? undefined : saved.source)
    );
    expect(api.saveRecipe).toHaveBeenCalledTimes(1);
  }
);

it.each(['owner', 'draft'] as const)(
  'ignores a pending save after the live %s identity changes',
  async (change) => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    let finish: (value: RecipeImportSaveResponse) => void = () => {};
    api.saveRecipe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const hook = renderHook(({ value }) => useRecipeImport(value), {
      initialProps: { value: preview },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    act(() =>
      hook.result.current.save.mutate({
        providerId: 'provider',
        recipeSlug: 'rice',
        sourceFingerprint: preview.sourceFingerprint,
        mappings: [reviewedMapping],
      })
    );
    await waitFor(() => expect(api.saveRecipe).toHaveBeenCalledTimes(1));
    if (change === 'owner') mockOwner = 'next-owner';
    hook.rerender({
      value:
        change === 'draft'
          ? { ...preview, sourceFingerprint: 'b'.repeat(64) }
          : preview,
    });
    client.clear();
    await act(async () => finish(saved));
    expect(
      client.getQueryData(['meals', 'recipe-import-source', 'owner', 'meal'])
    ).toBeUndefined();
    expect(
      client.getQueryData([
        'meals',
        'recipe-import-source',
        'next-owner',
        'meal',
      ])
    ).toBeUndefined();
  }
);

it.each([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  'blocks save for invalid selected core nutrition while keeping mappings editable (%s)',
  async (protein) => {
    const incomplete = {
      ...mockFoodVariant(),
      protein,
    } as unknown as FoodVariant;
    mockVariants = [incomplete];
    jest
      .mocked(getFoodById)
      .mockResolvedValue({ ...mockFood, default_variant: incomplete });
    api.previewRecipe.mockResolvedValue({
      ...preview,
      ingredients: [{ ...preview.ingredients[0]!, mapping: reviewedMapping }],
    });
    setup();
    await selectRecipe();
    await screen.findByText(/P \? g/);
    expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Choose food for Rice' })
    ).toBeEnabled();
    expect(
      screen.getByText(/Unknown values are not counted as zero/)
    ).toBeInTheDocument();
    expect(api.saveRecipe).not.toHaveBeenCalled();
  }
);

it('waits for selected variant nutrition to load before enabling save and accepts measured zero', async () => {
  let finish!: (food: Food) => void;
  mockVariants = [{ ...mockFoodVariant(), protein: 0 }];
  jest.mocked(getFoodById).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  api.previewRecipe.mockResolvedValue({
    ...preview,
    ingredients: [{ ...preview.ingredients[0]!, mapping: reviewedMapping }],
  });
  setup();
  await selectRecipe();
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
  mockVariants = [{ ...mockFoodVariant(), protein: 0 }];
  await act(async () => finish(mockFood));
  expect(await screen.findAllByText(/P 0 g/)).toHaveLength(2);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled()
  );
});

it('retains a confirmed newly created variant and existing variants when a refetch fails', async () => {
  const { client } = setup();
  await selectRecipe();
  await mapRice();
  mockChosenVariant = {
    ...mockFoodVariant(),
    id: 'created',
    serving_size: 200,
    serving_description: 'Created portion',
  };
  jest
    .mocked(getFoodById)
    .mockResolvedValueOnce(mockFood)
    .mockRejectedValue(new Error('refetch unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Choose food for Rice' }));
  fireEvent.click(screen.getByText('Choose dry rice'));
  fireEvent.click(await screen.findByText('Confirm 600 g'));
  expect(
    await screen.findByText('600 g · Created portion')
  ).toBeInTheDocument();
  expect(
    client
      .getQueryData<Food>(['foods', 'recipe-import', 'owner', 'food'])
      ?.variants?.map((v) => v.id)
  ).toEqual(expect.arrayContaining(['variant', 'created']));
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled();
  expect(
    await screen.findByText(
      `${(1200).toLocaleString()} kcal · P 30 g · C 180 g · F 30 g`
    )
  ).toBeInTheDocument();
});

it('renders candidate, mapped, total and saved nutrition in kJ while saving canonical mappings', async () => {
  mockEnergyUnit = 'kJ';
  api.suggestRecipe.mockResolvedValue({
    ingredients: [
      {
        ingredientId: 'rice',
        candidates: [
          {
            candidateId: 'local',
            source: 'local',
            foodId: 'food',
            variantId: 'variant',
            name: 'Dry rice',
            brand: null,
            servingSize: 100,
            servingUnit: 'g',
            nutrition: { calories: 400, protein: 10, carbs: 60, fat: 10 },
            nutritionComplete: true,
            unitCompatible: true,
          },
        ],
        suggestedCandidateId: 'local',
      },
    ],
    aiUsed: false,
    warnings: [],
  });
  setup();
  await selectRecipe();
  fireEvent.click(screen.getByRole('button', { name: 'Find food candidates' }));
  expect(
    await screen.findByText(
      `${(1673.6).toLocaleString()} kJ · P 10 g · C 60 g · F 10 g per serving`
    )
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review Dry rice' }));
  fireEvent.click(await screen.findByText('Confirm 600 g'));
  expect(
    await screen.findByText(
      `100 g: ${(1673.6).toLocaleString()} kJ · P 10 g · C 60 g · F 10 g`
    )
  ).toBeInTheDocument();
  expect(
    await screen.findByText(
      `${(10041.6).toLocaleString()} kJ · P 60 g · C 360 g · F 60 g`
    )
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  expect(
    await screen.findByText(
      `Whole recipe: ${(10041.6).toLocaleString()} kJ. 4 servings of 450 g.`
    )
  ).toBeInTheDocument();
  expect(api.saveRecipe).toHaveBeenCalledWith(
    expect.objectContaining({ mappings: [reviewedMapping] })
  );
});

it.each([new Error('connection lost'), new HttpApiError('server error', 500)])(
  'locks ambiguous saves against duplicate retries: %s',
  async (error) => {
    api.saveRecipe.mockRejectedValueOnce(error);
    const { client } = setup();
    await selectRecipe();
    await mapRice();
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
    await screen.findByText(
      /Check your meals library before starting another import/
    );
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: ['recipe-import-pending-save'] })
    ).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(screen.getByRole('button', { name: 'Save meal' })).toBeDisabled();
    expect(api.saveRecipe).toHaveBeenCalledTimes(1);
  }
);

it('leaves a validation-rejected save editable and allows a corrected retry', async () => {
  api.saveRecipe.mockRejectedValueOnce(new HttpApiError('invalid amount', 400));
  setup();
  await selectRecipe();
  await mapRice();
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  await screen.findByText('invalid amount');
  expect(
    screen.getByRole('button', { name: 'Choose food for Rice' })
  ).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  await screen.findByText('Meal saved. You can log portions from your diary.');
  expect(api.saveRecipe).toHaveBeenCalledTimes(2);
});

it.each(
  (['success', 'network', 'server'] as const).flatMap((outcome) =>
    (['closed', 'new-filter', 'profile', 'account'] as const).map((change) => ({
      outcome,
      change,
    }))
  )
)(
  'refreshes the retained owner library after a deferred $outcome save ($change) without writing private source caches',
  async ({ change, outcome }) => {
    let finish!: (value: RecipeImportSaveResponse) => void;
    let fail!: (error: Error) => void;
    api.saveRecipe.mockReturnValueOnce(
      new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      })
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    let libraryReads = 0;
    let committed = false;
    jest.mocked(getMeals).mockImplementation(async () => {
      libraryReads += 1;
      return committed ? [{ id: 'meal', name: 'Rice batch', foods: [] }] : [];
    });
    function Library({ filter }: { filter: string }) {
      const { data } = useMeals('all', filter);
      return (
        <div>
          {data?.map((meal) => (
            <p key={meal.id}>Library meal: {meal.name}</p>
          ))}
        </div>
      );
    }
    const view = (open: boolean, filter = 'all') => (
      <QueryClientProvider client={client}>
        <Library filter={filter} />
        <RecipeImportDialog
          open={open}
          onOpenChange={jest.fn()}
          onOpenMeal={jest.fn()}
        />
      </QueryClientProvider>
    );
    const panel = render(view(true));
    await selectRecipe();
    await mapRice();
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
    await waitFor(() => expect(api.saveRecipe).toHaveBeenCalledTimes(1));
    if (change === 'profile') mockActing = true;
    if (change === 'account') mockOwner = 'next-owner';
    if (change === 'profile' || change === 'account') {
      // Real sign-out/profile changes clear unscoped library caches.
      client.clear();
      client.setQueryData(['meals', 'filter', 'all', 'all'], []);
    }
    panel.rerender(
      view(
        change === 'profile' || change === 'account',
        change === 'new-filter' ? 'mine' : 'all'
      )
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const families = [
      ['foods', 'list'],
      ['mealPlans', 'owner'],
      ['v2', 'foods'],
      ['dailyProgress'],
    ];
    families.forEach((key) => client.setQueryData(key, ['retained']));
    const readsBefore = libraryReads;
    committed = true;
    await act(async () => {
      if (outcome === 'success') finish(saved);
      else
        fail(
          outcome === 'network'
            ? new Error('lost response')
            : new HttpApiError('server error', 500)
        );
    });
    if (change === 'closed' || change === 'new-filter')
      await waitFor(() => expect(libraryReads).toBeGreaterThan(readsBefore));
    else expect(libraryReads).toBe(readsBefore);
    if (change === 'closed' || change === 'new-filter')
      expect(
        await screen.findByText('Library meal: Rice batch')
      ).toBeInTheDocument();
    else
      expect(
        screen.queryByText('Library meal: Rice batch')
      ).not.toBeInTheDocument();
    if (change === 'closed' || change === 'new-filter')
      families.forEach((key) =>
        expect(client.getQueryState(key)?.isInvalidated).toBe(true)
      );
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: ['recipe-import-pending-save'] })
    ).toHaveLength(0);
    expect(
      client.getQueryData(['meals', 'recipe-import-source', 'owner', 'meal'])
    ).toBeUndefined();
    expect(
      client.getQueryData([
        'meals',
        'recipe-import-source',
        'next-owner',
        'meal',
      ])
    ).toBeUndefined();
  }
);

it.each(['unmount', 'owner', 'replaced'] as const)(
  'rejects a retained private food-cache callback after %s',
  async (change) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const hook = renderHook(() => useRecipeImportFoodAccess(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const retained = hook.result.current.cacheFood;
    if (change === 'unmount') hook.unmount();
    if (change === 'owner') {
      mockOwner = 'next-owner';
      hook.rerender();
    }
    if (change === 'replaced') {
      // Auth clears caches before the new profile render. Reusing the exact
      // old key must still not permit a pending selector callback to write.
      client.clear();
      client.setQueryData(['foods', 'recipe-import', 'owner', undefined], {
        replacementScope: true,
      });
    }
    act(() => retained(mockFood, mockFoodVariant()));
    expect(
      client.getQueryData(['foods', 'recipe-import', 'owner', 'food'])
    ).toBeUndefined();
    expect(
      client.getQueryData(['foods', 'recipe-import', 'next-owner', 'food'])
    ).toBeUndefined();
    if (change === 'owner') {
      act(() => hook.result.current.cacheFood(mockFood, mockFoodVariant()));
      expect(
        client.getQueryData<Food>([
          'foods',
          'recipe-import',
          'next-owner',
          'food',
        ])?.variants?.[0]?.id
      ).toBe('variant');
    }
  }
);
