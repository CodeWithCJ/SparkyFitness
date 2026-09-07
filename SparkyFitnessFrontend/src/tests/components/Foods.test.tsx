import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FoodDatabaseManager from '@/pages/Foods/Foods';
import { renderWithClient } from '../test-utils';
import { apiCall } from '@/api/api';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));
let mockActiveUserId = 'test-user-id';
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', activeUserId: mockActiveUserId },
  }),
}));

// Mock i18n directly for calls outside of hooks
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string, fallback?: string) => fallback || key,
    use: jest.fn().mockReturnThis(),
    init: jest.fn(),
  },
}));

// Mock react-i18next: return the inline default string when provided.
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

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
}));

// Mock favorites service: food1 is a favorite, food2 is not.
jest.mock('@/api/Foods/favoritesService', () => ({
  getFavorites: jest
    .fn()
    .mockResolvedValue({ favoriteFoods: [{ id: 'food1' }], favoriteMeals: [] }),
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
}));

// Stub the sibling sections + heavy dialogs so this test isolates the food table.
jest.mock('@/pages/Foods/MealManagement', () => () => (
  <div data-testid="meal-management" />
));
jest.mock('@/pages/Foods/MealPlanCalendar', () => () => (
  <div data-testid="meal-plan-calendar" />
));
jest.mock('@/components/FoodSearch/FoodSearchDialog', () => () => null);
jest.mock('@/components/FoodSearch/CustomFoodForm', () => () => null);
jest.mock('@/components/FoodUnitSelector', () => () => null);
jest.mock('@/pages/Foods/DeleteFoodDialog', () => ({
  __esModule: true,
  default: () => null,
}));
const foods = [
  {
    id: 'food1',
    name: 'Apple',
    user_id: 'test-user-id',
    barcode: '4006381333931',
    is_custom: true,
    default_variant: {},
  },
  {
    id: 'food2',
    name: 'Banana',
    user_id: 'test-user-id',
    default_variant: {},
    is_custom: true,
    provider_type: 'openfoodfacts',
  },
];

jest.mock('@/hooks/Foods/useFoodDatabaseManager', () => ({
  useFoodDatabaseManager: () => ({
    user: { id: 'test-user-id' },
    isAuthenticated: true,
    visibleNutrients: ['calories', 'protein', 'carbs', 'fat'],
    searchTerm: '',
    setSearchTerm: jest.fn(),
    itemsPerPage: 10,
    currentPage: 1,
    foodFilter: 'all',
    setFoodFilter: jest.fn(),
    sortOrder: 'name:asc',
    setSortOrder: jest.fn(),
    foodData: { foods },
    loading: false,
    totalPages: 1,
    pendingDeletion: null,
    handleConfirmDelete: jest.fn(),
    handleCancelDelete: jest.fn(),
    showFoodSearchDialog: false,
    setShowFoodSearchDialog: jest.fn(),
    showEditDialog: false,
    setShowEditDialog: jest.fn(),
    editingFood: null,
    showFoodUnitSelectorDialog: false,
    setShowFoodUnitSelectorDialog: jest.fn(),
    handleFoodSelected: jest.fn(),
    foodToAddToMeal: null,
    togglePublicSharing: jest.fn(),
    canEdit: () => true,
    handlePageChange: jest.fn(),
    handleEdit: jest.fn(),
    handleDuplicate: jest.fn(),
    handleDuplicateComplete: jest.fn(),
    showDuplicateDialog: false,
    duplicatingFood: null,
    isDuplicating: false,
    handleSaveComplete: jest.fn(),
    handleAddFoodToMeal: jest.fn(),
    handleDeleteRequest: jest.fn(),
    deleteFood: jest.fn(),
    mealTypes: [],
  }),
}));

describe('FoodDatabaseManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveUserId = 'test-user-id';
    jest.mocked(apiCall).mockResolvedValue({
      serverEnabled: true,
      userEnabled: false,
      productLanguage: 'de',
      providerScope: 'personal',
      status: { pending: 0, processing: 0, failed: 0, succeeded: 0 },
      recentFailures: [],
    });
  });
  it('shows a favorite indicator only on favorited food rows', async () => {
    renderWithClient(<FoodDatabaseManager />);

    expect(screen.getAllByText('Apple').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Banana').length).toBeGreaterThan(0);

    // Only food1 (Apple) is favorited, so the "Favorited" star indicator shows
    // for it; favoriting itself moved into the row's ⋮ menu (no inline button).
    await waitFor(() => {
      expect(
        screen.getAllByLabelText('Favorited').length
      ).toBeGreaterThanOrEqual(1);
    });
    expect(
      screen.queryByRole('button', { name: 'Add to favorites' })
    ).toBeNull();
  });

  it('offers one owned custom food for contribution without a bulk action', async () => {
    renderWithClient(<FoodDatabaseManager />);
    await screen.findAllByLabelText('Favorited');

    expect(
      screen.queryByRole('button', {
        name: 'Contribute all to Open Food Facts',
      })
    ).not.toBeInTheDocument();

    const menuTrigger = screen.getAllByRole('button', {
      name: 'Open menu',
    })[0];
    if (!menuTrigger) throw new Error('Expected a food action menu trigger.');
    fireEvent.pointerDown(menuTrigger, {
      button: 0,
      ctrlKey: false,
      pointerId: 1,
    });
    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Contribute to Open Food Facts' })
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Contribute to Open Food Facts' })
    );
    expect(
      await screen.findByLabelText('Your own product photo')
    ).toBeInTheDocument();
    expect(
      jest
        .mocked(apiCall)
        .mock.calls.every(([, options]) => options?.method === 'GET')
    ).toBe(true);
  });

  it.each([
    ['an imported food', 1, 'test-user-id'],
    ['a delegate', 0, 'another-user'],
  ])(
    'hides contribution actions for %s',
    async (_name, menuIndex, activeUserId) => {
      mockActiveUserId = activeUserId;
      renderWithClient(<FoodDatabaseManager />);
      await screen.findAllByLabelText('Favorited');
      const trigger = screen.getAllByRole('button', { name: 'Open menu' })[
        menuIndex
      ];
      if (!trigger) throw new Error('Missing menu trigger');
      fireEvent.pointerDown(trigger, {
        button: 0,
        ctrlKey: false,
        pointerId: 1,
      });
      await screen.findByRole('menuitem', { name: 'Edit food' });
      expect(
        screen.queryByRole('menuitem', {
          name: 'Contribute to Open Food Facts',
        })
      ).not.toBeInTheDocument();
    }
  );
});
