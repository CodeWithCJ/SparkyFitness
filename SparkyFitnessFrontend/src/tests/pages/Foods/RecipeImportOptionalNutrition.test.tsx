import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecipeImportReview from '@/pages/Foods/RecipeImportReview';
import type { Food, FoodVariant } from '@/types/food';
import type {
  RecipeImportPreview,
  RecipeImportSaveResponse,
} from '@workspace/shared';
import * as service from '@/api/Foods/recipeImportService';
import { getFoodById } from '@/api/Foods/foodService';

const mockFoodVariant = (): FoodVariant => ({
  id: 'variant',
  serving_size: 100,
  serving_unit: 'g',
  calories: 400,
  protein: 10,
  carbs: 60,
  fat: 10,
});
const mockFood: Food = {
  id: 'food',
  name: 'Dry rice',
  is_custom: false,
  default_variant: mockFoodVariant(),
};
let mockVariants: FoodVariant[] = [];
const reviewedMapping = {
  ingredientId: 'rice',
  foodId: 'food',
  variantId: 'variant',
  quantity: 600,
  unit: 'g',
  confirmed: true as const,
};
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
      quantity: 600,
      unit: 'g',
      originalUnit: 'g',
      note: '',
      issues: ['incomplete_nutrition'],
      missingNutrients: ['dietary_fiber', 'sodium'],
      mapping: reviewedMapping,
      mappingOrigin: 'saved',
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
    syncEligible: false,
    lastSyncedAt: null,
  },
  nutrition: { calories: 2400, protein: 60, carbs: 360, fat: 60 },
  servingSize: 450,
  servingUnit: 'g',
  totalServings: 4,
};

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'owner', isActingOnBehalf: false }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: (unit: string) => unit,
    aiAssistedConversions: false,
    timezone: 'UTC',
  }),
}));
jest.mock('@/hooks/AI/useAIServiceSettings', () => ({
  useActiveAIService: () => ({ data: undefined }),
}));
jest.mock('@/hooks/AI/useUserAiConfigAllowed', () => ({
  useUserAiConfigAllowed: () => ({ data: false }),
}));
jest.mock('@/api/Foods/recipeImportService');
jest.mock('@/api/Foods/foodService', () => ({
  getFoodById: jest.fn(),
  getFoodDetailsV2: jest.fn(),
}));
jest.mock('@/hooks/Foods/useFoodVariants', () => ({
  ...jest.requireActual<typeof import('@/hooks/Foods/useFoodVariants')>(
    '@/hooks/Foods/useFoodVariants'
  ),
  foodVariantsOptions: (foodId: string) => ({
    queryKey: ['food-variants', foodId],
    queryFn: async () => mockVariants,
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
jest.mock('@/components/FoodSearch/FoodFormDialog', () => ({
  FoodFormDialog: () => null,
}));
const api = jest.mocked(service);
beforeEach(() => {
  jest.clearAllMocks();
  api.saveRecipe.mockResolvedValue(saved);
  api.getRecipeSource.mockResolvedValue(saved.source);
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RecipeImportReview
          preview={preview}
          onBack={jest.fn()}
          onOpenMeal={jest.fn()}
        />
      </QueryClientProvider>
    ),
  };
}

it.each([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, 0])(
  'keeps recipe optional nutrition unknown or measured zero through converted-unit POST, readback and selection (%s)',
  async (dietary_fiber) => {
    const base = {
      ...mockFoodVariant(),
      dietary_fiber,
      sodium: 0,
      iron: 2,
    } as unknown as FoodVariant;
    const food = { ...mockFood, default_variant: base };
    mockVariants = [base];
    jest.mocked(getFoodById).mockResolvedValue(food);
    let posted: Record<string, unknown> | undefined;
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async (url, options) => {
        expect(url).toBe('/api/foods/food-variants');
        expect(options?.method).toBe('POST');
        posted = JSON.parse(String(options?.body)) as Record<string, unknown>;
        // The existing nullable INSERT/RETURNING API returns null for omitted
        // optional parameters. Inspect the actual JSON request before supplying
        // that boundary response; this is not a real service/database write.
        const readback = {
          ...posted,
          id: 'converted-kg',
          dietary_fiber: posted['dietary_fiber'] ?? null,
        } as unknown as FoodVariant;
        mockVariants = [base, readback];
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => readback,
          text: async () => JSON.stringify(readback),
        } as Response;
      });
    try {
      const { client } = setup();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled()
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Choose food for Rice' })
      );
      fireEvent.click(screen.getByText('Choose dry rice'));
      await screen.findByLabelText('Quantity');
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(await screen.findByRole('option', { name: /^kg$/ }));
      await waitFor(() =>
        expect(screen.getByLabelText('Quantity')).toHaveValue('0.6')
      );
      fireEvent.click(screen.getByRole('button', { name: 'Update Food' }));
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      expect(posted).toEqual(
        expect.objectContaining({
          serving_size: 1,
          serving_unit: 'kg',
          calories: 4000,
          sodium: 0,
          iron: 20,
        })
      );
      if (dietary_fiber === 0) expect(posted?.['dietary_fiber']).toBe(0);
      else expect(posted).not.toHaveProperty('dietary_fiber');
      await screen.findByText(`${(0.6).toLocaleString()} kg`);
      const cached = client.getQueryData<Food>([
        'foods',
        'recipe-import',
        'owner',
        'food',
      ]);
      expect(
        cached?.variants?.find((variant) => variant.id === 'converted-kg')
          ?.dietary_fiber
      ).toBe(dietary_fiber === 0 ? 0 : null);
      if (dietary_fiber === 0)
        expect(
          screen.queryByText('Missing nutrients: dietary_fiber')
        ).not.toBeInTheDocument();
      else
        expect(
          screen.getByText('Missing nutrients: dietary_fiber')
        ).toBeInTheDocument();
      expect(
        screen.queryByText(/Missing nutrients: .*sodium/)
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save meal' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
      await waitFor(() =>
        expect(api.saveRecipe).toHaveBeenCalledWith(
          expect.objectContaining({
            mappings: [
              expect.objectContaining({
                variantId: 'converted-kg',
                quantity: 0.6,
                unit: 'kg',
              }),
            ],
          })
        )
      );
    } finally {
      global.fetch = originalFetch;
    }
  }
);
