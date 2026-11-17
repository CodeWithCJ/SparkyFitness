import '@testing-library/jest-dom';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecipeImportIngredientRow from '@/pages/Foods/RecipeImportIngredientRow';
import { apiCall } from '@/api/api';
import { getFoodById, getFoodDetailsV2 } from '@/api/Foods/foodService';
import type { Food } from '@/types/food';

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'owner', isActingOnBehalf: false }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner', activeUserId: 'owner' } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    dateFormat: 'yyyy-MM-dd',
    formatDate: (value: string) => value,
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: (unit: string) => unit,
    loggingLevel: 'ERROR',
    nutrientDisplayPreferences: [],
    autoScaleOnlineImports: false,
    aiAssistedConversions: false,
  }),
}));
const mockCustomNutrients: [] = [];
jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: mockCustomNutrients }),
  useUpdateCustomNutrientMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/hooks/Foods/useOpenFoodFactsContribution', () => ({
  useOpenFoodFactsContributionAvailability: () => ({ available: false }),
}));
jest.mock('@/hooks/AI/useAIServiceSettings', () => ({
  useActiveAIService: () => ({ data: undefined }),
}));
jest.mock('@/hooks/AI/useUserAiConfigAllowed', () => ({
  useUserAiConfigAllowed: () => ({ data: false }),
}));
jest.mock('@/api/api', () => ({
  ...jest.requireActual<typeof import('@/api/api')>('@/api/api'),
  apiCall: jest.fn(),
}));
jest.mock('@/api/Foods/foodService', () => ({
  ...jest.requireActual<typeof import('@/api/Foods/foodService')>(
    '@/api/Foods/foodService'
  ),
  getFoodById: jest.fn(),
  getFoodDetailsV2: jest.fn(),
}));
// The form, save hook and HTTP service are real. The final picker exposes the
// actual persisted food handed to it; picker behavior has its own regressions.
jest.mock('@/components/FoodUnitSelector', () => ({
  __esModule: true,
  default: (
    props: ComponentProps<
      typeof import('@/components/FoodUnitSelector').default
    >
  ) => (
    <button
      onClick={() =>
        props.onSelect(props.food, 600, 'g', props.food.default_variant!)
      }
    >
      Confirm local food {props.food.id}
    </button>
  ),
}));

it('persists the exact external candidate through the real form before selecting its returned local food id', async () => {
  const variant = {
    serving_size: 100,
    serving_unit: 'g',
    calories: 400,
    protein: 10,
    carbs: 60,
    fat: 10,
    is_default: true,
  };
  const external: Food = {
    id: '',
    name: 'Exact provider rice',
    is_custom: false,
    provider_type: 'usda',
    provider_external_id: 'exact-rice',
    default_variant: variant,
    variants: [variant],
  };
  const local: Food = {
    ...external,
    id: 'new-local-food',
    is_custom: true,
    default_variant: { ...variant, id: 'saved-variant' },
  };
  jest.mocked(getFoodDetailsV2).mockResolvedValue(external);
  jest.mocked(getFoodById).mockResolvedValue(local);
  jest.mocked(apiCall).mockImplementation(async (endpoint, options) => {
    if (endpoint === '/foods' && options?.method === 'POST') return local;
    if (endpoint.startsWith('/foods/food-variants?'))
      return [local.default_variant!];
    throw new Error(`Unexpected HTTP boundary: ${endpoint}`);
  });
  const confirm = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RecipeImportIngredientRow
        ingredient={{
          ingredientId: 'rice',
          sourceFoodKey: 'opaque',
          name: 'Rice',
          originalText: '600 g rice',
          quantity: 600,
          unit: 'g',
          originalUnit: 'g',
          note: '',
          issues: [],
          missingNutrients: [],
          mapping: null,
          mappingOrigin: null,
        }}
        suggestion={{
          ingredientId: 'rice',
          suggestedCandidateId: 'exact',
          candidates: [
            {
              candidateId: 'exact',
              source: 'external',
              providerType: 'usda',
              providerId: 'configured-provider',
              providerExternalId: 'exact-rice',
              name: 'Exact provider rice',
              brand: null,
              servingSize: 100,
              servingUnit: 'g',
              nutrition: { calories: 400, protein: 10, carbs: 60, fat: 10 },
              nutritionComplete: true,
              unitCompatible: true,
            },
          ],
        }}
        onConfirm={confirm}
      />
    </QueryClientProvider>
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Review Exact provider rice' })
  );
  const save = await screen.findByRole('button', { name: 'Add Food' });
  expect(apiCall).not.toHaveBeenCalledWith('/foods', expect.anything());
  fireEvent.click(save);
  const select = await screen.findByRole('button', {
    name: 'Confirm local food new-local-food',
  });
  expect(getFoodDetailsV2).toHaveBeenCalledWith(
    'usda',
    'exact-rice',
    'configured-provider'
  );
  expect(apiCall).toHaveBeenCalledWith(
    '/foods',
    expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        provider_type: 'usda',
        provider_external_id: 'exact-rice',
        name: 'Exact provider rice',
      }),
    })
  );
  expect(getFoodById).toHaveBeenCalledWith('new-local-food');
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(select);
  await waitFor(() =>
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        foodId: 'new-local-food',
        variantId: 'saved-variant',
        quantity: 600,
      })
    )
  );
});
