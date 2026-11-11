import type { ComponentProps } from 'react';
import {
  act,
  screen,
  waitFor,
  fireEvent,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { getMealById, updateMeal } from '@/api/Foods/meals';
import {
  getRecipeSource,
  previewRecipeNutritionSync,
  syncRecipeNutrition,
} from '@/api/Foods/recipeImportService';
import MealManagement from '@/pages/Foods/MealManagement';
import type { Meal } from '@/types/meal';
import type { RecipeImportSource } from '@workspace/shared';
import { renderWithClient } from '../test-utils';

// mock i18 directly for calls outside of hooks
jest.mock('@/i18n', () => ({
  __esModule: true, // Dies behebt den "default.t is not a function" Fehler
  default: {
    t: (key: string, fallback?: string) => fallback || key,
    use: jest.fn().mockReturnThis(),
    init: jest.fn(),
  },
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: string | Record<string, unknown>) => {
      if (typeof defaultValueOrOpts === 'string') return defaultValueOrOpts;
      if (
        defaultValueOrOpts &&
        typeof defaultValueOrOpts === 'object' &&
        'defaultValue' in defaultValueOrOpts
      ) {
        return defaultValueOrOpts['defaultValue'] as string;
      }
      return key;
    },
  }),
}));

// Mock contexts
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'test-user-id' }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'debug',
    itemDisplayLimit: 100,
    nutrientDisplayPreferences: [
      {
        view_group: 'quick_info',
        platform: 'desktop',
        visible_nutrients: ['calories', 'protein', 'carbs', 'fat'],
      },
    ],
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
  }),
}));

// Mock toast
jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

// Mock logging
jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock services
const mockGetMeals = jest.fn();
jest.mock('@/api/Foods/meals', () => ({
  getMeals: (...args: unknown[]) => mockGetMeals(...args),
  deleteMeal: jest.fn(),
  getMealById: jest.fn(),
  getMealDeletionImpact: jest.fn(),
  updateMeal: jest.fn(),
}));

let mockRealBuilder = false;
jest.mock('@/api/Foods/recipeImportService', () => ({
  getRecipeSource: jest.fn(),
  previewRecipeNutritionSync: jest.fn(),
  syncRecipeNutrition: jest.fn(),
}));
jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
}));
jest.mock('@/components/FoodUnitSelector', () => ({
  __esModule: true,
  default: (
    props: ComponentProps<
      typeof import('@/components/FoodUnitSelector').default
    >
  ) =>
    props.open ? (
      <div>
        <button
          onClick={() =>
            props.onSelect(props.food, 2, 'piece', props.food.default_variant!)
          }
        >
          Change ingredient quantity
        </button>
        <button
          onClick={() =>
            props.onSelect(props.food, 1, 'piece', {
              ...props.food.default_variant!,
              id: 'another-variant',
            })
          }
        >
          Change ingredient variant
        </button>
      </div>
    ) : null,
}));

// Mock MealBuilder sub-component
jest.mock('@/components/MealBuilder', () => {
  const Actual = jest.requireActual<typeof import('@/components/MealBuilder')>(
    '@/components/MealBuilder'
  ).default;
  return function MockMealBuilder(
    props: ComponentProps<typeof import('@/components/MealBuilder').default>
  ) {
    if (mockRealBuilder) {
      return <Actual {...props} />;
    }
    return <div data-testid="meal-builder">MealBuilder</div>;
  };
});

// Mock favorites service: meal1 is a favorite, meal2 is not.
jest.mock('@/api/Foods/favoritesService', () => ({
  getFavorites: jest
    .fn()
    .mockResolvedValue({ favoriteFoods: [], favoriteMeals: [{ id: 'meal1' }] }),
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
}));

describe('MealManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRealBuilder = false;
  });

  it('renders title and empty state when no meals exist', async () => {
    mockGetMeals.mockResolvedValue([]);

    renderWithClient(<MealManagement />);

    expect(screen.getByText('Meal Management')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText('No meals found. Create one!')
      ).toBeInTheDocument();
    });
  });

  it('renders meal list when meals are returned', async () => {
    mockGetMeals.mockResolvedValue([
      {
        id: 'meal1',
        name: 'Breakfast Bowl',
        description: 'A healthy start',
        is_public: false,
        foods: [],
      },
      {
        id: 'meal2',
        name: 'Protein Shake',
        description: '',
        is_public: true,
        foods: [],
      },
    ]);

    renderWithClient(<MealManagement />);

    await waitFor(() => {
      expect(screen.getAllByText('Breakfast Bowl').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Protein Shake').length).toBeGreaterThan(0);
    });
  });

  it('shows a favorite indicator only on favorited meal rows', async () => {
    mockGetMeals.mockResolvedValue([
      {
        id: 'meal1',
        name: 'Breakfast Bowl',
        description: 'A healthy start',
        is_public: false,
        foods: [],
      },
      {
        id: 'meal2',
        name: 'Protein Shake',
        description: '',
        is_public: true,
        foods: [],
      },
    ]);

    renderWithClient(<MealManagement />);

    // Only meal1 is favorited, so exactly one row shows the "Favorited" star
    // indicator (the toggle itself lives in the row's ⋮ menu, not inline).
    await waitFor(() => {
      expect(screen.getAllByText('Breakfast Bowl').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByLabelText('Favorited').length).toBeGreaterThanOrEqual(
      1
    );
    // No inline favorite buttons anymore — favoriting moved into the ⋮ menu.
    expect(
      screen.queryByRole('button', { name: 'Add to favorites' })
    ).toBeNull();
  });

  it('keeps source sync blocked without claiming edits until a failed meal detail load is retried', async () => {
    mockRealBuilder = true;
    const meal: Meal = {
      id: 'meal1',
      name: 'Apple meal',
      is_public: false,
      serving_size: 1,
      serving_unit: 'serving',
      total_servings: 1,
      foods: [
        {
          food_id: 'apple',
          food_name: 'Apple',
          variant_id: 'original',
          quantity: 1,
          unit: 'piece',
          serving_size: 1,
          serving_unit: 'piece',
          calories: 95,
          protein: 0.5,
          carbs: 25,
          fat: 0.3,
        },
      ],
    };
    const source: RecipeImportSource = {
      mealId: 'meal1',
      providerId: 'provider',
      recipeSlug: 'apple-meal',
      recipeId: 'recipe',
      name: 'Original source',
      recipeServings: 1,
      sourceFingerprint: 'a'.repeat(64),
      mealFingerprint: 'saved-meal',
      ingredients: [],
      mappings: [],
      syncWarnings: [],
      syncEligible: true,
      lastSyncedAt: null,
    };
    let failLoad: (reason: Error) => void = () => {};
    const initialRead = new Promise<Meal>((_resolve, reject) => {
      failLoad = reject;
    });
    let finishRetry: (value: Meal) => void = () => {};
    const retryRead = new Promise<Meal>((resolve) => {
      finishRetry = resolve;
    });
    mockGetMeals.mockResolvedValue([meal]);
    jest
      .mocked(getMealById)
      .mockImplementationOnce(() => initialRead)
      .mockImplementationOnce(() => retryRead);
    jest.mocked(getRecipeSource).mockResolvedValue(source);
    jest.mocked(previewRecipeNutritionSync).mockResolvedValue({
      mealId: source.mealId,
      mealName: meal.name,
      recipeName: source.name,
      recipeSlug: source.recipeSlug,
      recipeServings: 1,
      sourceChanged: false,
      existingNutrition: {},
      batchNutrition: { calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
      nutrition: { calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
      confirmationFingerprint: 'c'.repeat(64),
    });
    jest.mocked(syncRecipeNutrition).mockResolvedValue({
      status: 'synced',
      source,
    });
    renderWithClient(<MealManagement />);
    const menu = await screen.findAllByRole('button', { name: 'Open menu' });
    fireEvent.pointerDown(menu[0]!, {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit Meal' }));
    const syncButton = await screen.findByRole('button', {
      name: 'Sync nutrition to Mealie',
    });
    expect(syncButton).toBeDisabled();
    expect(
      screen.queryByText(
        'Save or discard ingredient changes before syncing nutrition to Mealie.'
      )
    ).not.toBeInTheDocument();
    await act(async () => failLoad(new Error('Meal detail request failed')));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load meal for editing.'
    );
    expect(syncButton).toBeDisabled();
    expect(
      screen.queryByText(
        'Save or discard ingredient changes before syncing nutrition to Mealie.'
      )
    ).not.toBeInTheDocument();
    fireEvent.click(syncButton);
    expect(previewRecipeNutritionSync).not.toHaveBeenCalled();
    expect(syncRecipeNutrition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading meal' }));
    await waitFor(() => expect(getMealById).toHaveBeenCalledTimes(2));
    expect(getMealById).toHaveBeenNthCalledWith(2, 'meal1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Loading meal ingredients…')).toBeInTheDocument();
    expect(syncButton).toBeDisabled();
    fireEvent.click(syncButton);
    expect(previewRecipeNutritionSync).not.toHaveBeenCalled();
    expect(syncRecipeNutrition).not.toHaveBeenCalled();
    await act(async () => finishRetry(meal));
    expect(await screen.findByText('Apple')).toBeInTheDocument();
    await waitFor(() => expect(syncButton).toBeEnabled());
    expect(
      screen.queryByText(
        'Save or discard ingredient changes before syncing nutrition to Mealie.'
      )
    ).not.toBeInTheDocument();
    fireEvent.click(syncButton);
    const confirm = await screen.findByRole('button', {
      name: 'Confirm nutrition sync',
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(previewRecipeNutritionSync).toHaveBeenCalledWith('meal1');
    expect(syncRecipeNutrition).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(
      await screen.findByText('Nutrition synced to Mealie.')
    ).toBeInTheDocument();
    expect(syncRecipeNutrition).toHaveBeenCalledWith('meal1', 'c'.repeat(64));
  });
});

it.each([
  ['quantity', 'discard'],
  ['quantity', 'save'],
  ['variant', 'discard'],
  ['variant', 'save'],
] as const)(
  'blocks source sync beside unsaved real meal %s edits and restores eligibility after %s',
  async (edit, outcome) => {
    jest.clearAllMocks();
    mockRealBuilder = true;
    let currentMeal = {
      id: 'meal1',
      name: 'Apple meal',
      is_public: false,
      serving_size: 1,
      serving_unit: 'serving',
      total_servings: 1,
      foods: [
        {
          food_id: 'apple',
          food_name: 'Apple',
          variant_id: 'original',
          quantity: 1,
          unit: 'piece',
          serving_size: 1,
          serving_unit: 'piece',
          calories: 95,
          protein: 0.5,
          carbs: 25,
          fat: 0.3,
        },
      ],
    };
    mockGetMeals.mockResolvedValue([currentMeal]);
    jest.mocked(getMealById).mockImplementation(async () => currentMeal);
    jest.mocked(updateMeal).mockImplementation(async (_id, payload) => {
      currentMeal = {
        ...currentMeal,
        foods: payload.foods as typeof currentMeal.foods,
      };
      return currentMeal;
    });
    jest.mocked(getRecipeSource).mockResolvedValue({
      name: 'Original source',
      syncEligible: true,
    } as Awaited<ReturnType<typeof getRecipeSource>>);
    renderWithClient(<MealManagement />);
    async function openEditor() {
      const menu = await screen.findAllByRole('button', { name: 'Open menu' });
      fireEvent.pointerDown(menu[0]!, {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      });
      fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Edit Meal' })
      );
      await screen.findByText('Apple');
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Sync nutrition to Mealie' })
        ).toBeEnabled()
      );
    }
    async function changeIngredient() {
      const row = screen.getByText('Apple').parentElement!.parentElement!;
      fireEvent.click(within(row).getAllByRole('button')[0]!);
      fireEvent.click(
        await screen.findByRole('button', { name: `Change ingredient ${edit}` })
      );
      expect(
        screen.getByRole('button', { name: 'Sync nutrition to Mealie' })
      ).toBeDisabled();
      expect(
        screen.getByText(
          'Save or discard ingredient changes before syncing nutrition to Mealie.'
        )
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Sync nutrition to Mealie' })
      );
      expect(syncRecipeNutrition).not.toHaveBeenCalled();
    }
    await openEditor();
    await changeIngredient();
    if (outcome === 'discard') {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Save Meal' }));
      await waitFor(() => expect(updateMeal).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'Save Meal' })
        ).not.toBeInTheDocument()
      );
    }
    await openEditor();
    expect(
      screen.queryByText(
        'Save or discard ingredient changes before syncing nutrition to Mealie.'
      )
    ).not.toBeInTheDocument();
  }
);
