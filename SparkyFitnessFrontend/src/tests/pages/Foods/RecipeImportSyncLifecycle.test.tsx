import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RecipeImportSource } from '@workspace/shared';
import * as api from '@/api/Foods/recipeImportService';
import { createMutationCache } from '@/lib/mutationCache';
import { toast } from '@/hooks/use-toast';
import RecipeImportSourcePanel from '@/pages/Foods/RecipeImportSourcePanel';

jest.mock('@/api/Foods/recipeImportService');
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'owner', isActingOnBehalf: false }),
}));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
  }),
}));
jest.mock('@/utils/logging', () => ({ error: jest.fn() }));
jest.mock('@/utils/userPreferences', () => ({
  getUserLoggingLevel: () => 'ERROR',
}));

const key = ['meals', 'recipe-import-source', 'owner', 'meal'];
const source: RecipeImportSource = {
  providerId: 'provider',
  recipeId: 'rice',
  recipeSlug: 'rice',
  name: 'Rice',
  recipeServings: 4,
  sourceFingerprint: 'base',
  ingredients: [],
  mappings: [],
  syncWarnings: [],
  syncEligible: true,
  lastSyncedAt: null,
  mealId: 'meal',
};
const response = {
  status: 'synced' as const,
  source: { ...source, lastSyncedAt: '2026-11-09T10:00:00Z' },
};
async function confirmNutritionSync() {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) fireEvent.click(cancel);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Sync nutrition to Mealie' })
  );
  const confirm = await screen.findByRole('button', {
    name: 'Confirm nutrition sync',
  });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.previewRecipeNutritionSync).mockResolvedValue({
    mealId: 'meal',
    mealName: 'Saved rice',
    recipeName: 'Rice',
    recipeSlug: 'rice',
    recipeServings: 4,
    sourceChanged: false,
    existingNutrition: {},
    batchNutrition: { calories: 2400 },
    nutrition: { calories: 600 },
    confirmationFingerprint: 'c'.repeat(64),
  });
  // After an identity clear, source must be fetched authoritatively, never
  // recreated from the panel's retained initialSource or obsolete mutation.
  jest
    .mocked(api.getRecipeSource)
    .mockImplementation(() => new Promise(() => {}));
});

it.each(['clear', 'replacement', 'unmount', 'same-owner'] as const)(
  'guards mounted source success and failure after %s and permits a fresh same-ID sync',
  async (change) => {
    for (const failure of [false, true]) {
      jest.mocked(toast).mockClear();
      const client = new QueryClient({
        mutationCache: createMutationCache(),
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      let finish!: (value: typeof response) => void;
      let fail!: (error: Error) => void;
      jest.mocked(api.syncRecipeNutrition).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = resolve;
            fail = reject;
          })
      );
      const panel = render(
        <QueryClientProvider client={client}>
          <RecipeImportSourcePanel mealId="meal" initialSource={source} />
        </QueryClientProvider>
      );
      await confirmNutritionSync();
      await waitFor(() => expect(finish).toBeDefined());
      const mutation = client
        .getMutationCache()
        .getAll()
        .find((item) => item.state.status === 'pending')!;
      act(() => {
        if (change === 'clear' || change === 'replacement') client.clear();
        if (change === 'replacement')
          client.setQueryData(key, { ...source, name: 'Replacement source' });
        if (change === 'same-owner')
          client.setQueryData(key, { ...source, name: 'Renamed source' });
      });
      if (change === 'same-owner')
        await act(async () => {
          await client.fetchQuery({
            queryKey: key,
            queryFn: async () => ({ ...source, name: 'Renamed source' }),
            staleTime: 0,
          });
        });
      if (change === 'unmount') panel.unmount();
      await act(async () => {
        if (failure) fail(new Error('sync rejected'));
        else finish(response);
      });
      await waitFor(() =>
        expect(mutation.state.status).toBe(failure ? 'error' : 'success')
      );
      if (change === 'same-owner') {
        await screen.findByText(
          failure ? 'sync rejected' : 'Nutrition synced to Mealie.'
        );
        expect(toast).toHaveBeenCalledTimes(failure ? 1 : 0);
      } else {
        await waitFor(() =>
          expect(
            screen.queryByText('Nutrition synced to Mealie.')
          ).not.toBeInTheDocument()
        );
        expect(screen.queryByText('sync rejected')).not.toBeInTheDocument();
        expect(toast).not.toHaveBeenCalled();
        expect(
          client.getQueryData<RecipeImportSource>(key)?.lastSyncedAt
        ).not.toBe(response.source.lastSyncedAt);
        if (change === 'clear')
          expect(client.getQueryData(key)).toBeUndefined();
      }
      if (change !== 'unmount') {
        // A newly authenticated source can use the same owner and query key.
        act(() => client.setQueryData(key, source));
        jest.mocked(api.syncRecipeNutrition).mockResolvedValue(response);
        for (let retry = 0; retry < 2; retry += 1) {
          const calls = jest.mocked(api.syncRecipeNutrition).mock.calls.length;
          await confirmNutritionSync();
          await waitFor(() =>
            expect(api.syncRecipeNutrition).toHaveBeenCalledTimes(calls + 1)
          );
          await waitFor(() =>
            expect(
              client.getQueryData<RecipeImportSource>(key)?.lastSyncedAt
            ).toBe(response.source.lastSyncedAt)
          );
          await screen.findByText('Nutrition synced to Mealie.');
        }
        panel.unmount();
      }
      expect(client.getQueryCache().hasListeners()).toBe(false);
      client.clear();
    }
  }
);
