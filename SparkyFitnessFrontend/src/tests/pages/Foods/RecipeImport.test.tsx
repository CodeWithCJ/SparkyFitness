import '@testing-library/jest-dom';
import type { ComponentProps } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Food } from '@/types/food';
import type {
  RecipeImportPreview,
  RecipeImportSaveResponse,
} from '@workspace/shared';
import RecipeImportDialog from '@/pages/Foods/RecipeImportDialog';
import RecipeImportSourcePanel from '@/pages/Foods/RecipeImportSourcePanel';
import * as service from '@/api/Foods/recipeImportService';
import { getFoodDetailsV2 } from '@/api/Foods/foodService';

let mockActing = false;
let mockRealSelector = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    isActingOnBehalf: mockActing,
    activeUserId: 'owner',
  }),
}));
jest.mock('@/api/Foods/recipeImportService');
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
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
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
    queryFn: async () => [],
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
          props.onSelect(mockFood, 600, 'g', mockFood.default_variant!)
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
beforeEach(() => {
  jest.clearAllMocks();
  mockActing = false;
  mockRealSelector = false;
  api.browseRecipes.mockResolvedValue({
    items: [
      { id: 'recipe', slug: 'rice', name: 'Rice batch', recipeServings: 4 },
    ],
    pagination: { page: 1, pageSize: 10, totalCount: 1, hasMore: false },
  });
  api.previewRecipe.mockResolvedValue(preview);
  api.saveRecipe.mockResolvedValue(saved);
  api.getRecipeSource.mockResolvedValue(saved.source);
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
  fireEvent.click(
    await screen.findByRole('button', { name: 'Sync nutrition to Mealie' })
  );
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
  'Remote recipe changed. Review and import again.',
  'Provider unavailable. Check Mealie before retrying.',
])('retains the saved local meal after sync failure: %s', async (message) => {
  api.syncRecipeNutrition.mockRejectedValue(new Error(message));
  setup();
  await selectRecipe();
  await mapRice();
  fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Sync nutrition to Mealie' })
  );
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
  fireEvent.click(
    await screen.findByRole('button', { name: 'Sync nutrition to Mealie' })
  );
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
