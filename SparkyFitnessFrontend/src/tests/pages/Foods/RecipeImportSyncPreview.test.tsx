import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  RecipeImportSource,
  RecipeImportSyncPreview,
} from '@workspace/shared';
import * as api from '@/api/Foods/recipeImportService';
import RecipeImportSourcePanel from '@/pages/Foods/RecipeImportSourcePanel';

jest.mock('@/api/Foods/recipeImportService', () => ({
  getRecipeSource: jest.fn(),
  syncRecipeNutrition: jest.fn(),
  previewRecipeNutritionSync: jest.fn(async () => mockPreview),
}));
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'owner', isActingOnBehalf: false }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
  }),
}));
jest.mock('@/utils/userPreferences', () => ({
  getUserLoggingLevel: () => 'ERROR',
}));
jest.mock('@/utils/logging', () => ({
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

const source: RecipeImportSource = {
  providerId: 'provider',
  recipeId: 'rice',
  recipeSlug: 'rice',
  name: 'Rice',
  recipeServings: 4,
  sourceFingerprint: 'base',
  mealFingerprint: 'base',
  ingredients: [],
  mappings: [],
  syncWarnings: [],
  syncEligible: true,
  lastSyncedAt: null,
  mealId: 'meal',
};
const mockPreview: RecipeImportSyncPreview = {
  mealId: 'meal',
  mealName: 'My saved meal',
  recipeName: 'Current Mealie recipe',
  recipeSlug: 'rice',
  recipeServings: 4,
  sourceChanged: true,
  existingNutrition: {
    calories: '100',
    proteinContent: '1',
    carbohydrateContent: '2',
    fatContent: '3',
  },
  batchNutrition: { calories: 2400 },
  nutrition: { calories: 600, protein: 15, carbs: 90, fat: 15 },
  confirmationFingerprint: 'c'.repeat(64),
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.getRecipeSource).mockResolvedValue(source);
  jest
    .mocked(api.syncRecipeNutrition)
    .mockResolvedValue({ status: 'synced', source });
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RecipeImportSourcePanel mealId="meal" initialSource={source} />
      </QueryClientProvider>
    ),
  };
}

it('reviews the changed source and current nutrition, then cancels without any write', async () => {
  mount();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Sync nutrition to Mealie' })
  );
  expect(
    await screen.findByRole('heading', { name: 'Review nutrition sync' })
  ).toBeInTheDocument();
  expect(await screen.findByText('Current Mealie recipe')).toBeInTheDocument();
  expect(screen.getByText('600 kcal')).toBeInTheDocument();
  expect(screen.getByText(/recipe has changed in Mealie/)).toBeInTheDocument();
  expect(api.syncRecipeNutrition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.syncRecipeNutrition).not.toHaveBeenCalled();
});

it('sends the reviewed fingerprint only after confirmation and prevents a duplicate press', async () => {
  let finish!: () => void;
  jest.mocked(api.syncRecipeNutrition).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ status: 'synced', source });
      })
  );
  mount();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Sync nutrition to Mealie' })
  );
  const confirm = await screen.findByRole('button', {
    name: 'Confirm nutrition sync',
  });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(api.syncRecipeNutrition).toHaveBeenCalledTimes(1));
  expect(api.syncRecipeNutrition).toHaveBeenCalledWith('meal', 'c'.repeat(64));
  await act(async () => finish());
  expect(
    await screen.findByText('Nutrition synced to Mealie.')
  ).toBeInTheDocument();
});

it('discards a pending private preview after the owner cache is cleared', async () => {
  let finish!: (value: RecipeImportSyncPreview) => void;
  jest.mocked(api.previewRecipeNutritionSync).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = mount();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Sync nutrition to Mealie' })
  );
  await waitFor(() => expect(finish).toBeDefined());
  jest
    .mocked(api.getRecipeSource)
    .mockImplementation(() => new Promise(() => {}));
  act(() => view.client.clear());
  await act(async () => finish(mockPreview));
  expect(screen.queryByText('Current Mealie recipe')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Confirm nutrition sync' })
  ).not.toBeInTheDocument();
  expect(api.syncRecipeNutrition).not.toHaveBeenCalled();
  act(() =>
    view.client.setQueryData(
      ['meals', 'recipe-import-source', 'owner', 'meal'],
      source
    )
  );
  await screen.findByRole('button', { name: 'Sync nutrition to Mealie' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
