import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FoodDatabaseManager from '@/pages/Foods/Foods';
import { renderWithClient } from '../test-utils';

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

// Mock favorites service so the FavoriteStarButton query resolves (empty).
jest.mock('@/api/Foods/favoritesService', () => ({
  getFavorites: jest
    .fn()
    .mockResolvedValue({ favoriteFoods: [], favoriteMeals: [] }),
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
  { id: 'food1', name: 'Apple', user_id: 'test-user-id', default_variant: {} },
  { id: 'food2', name: 'Banana', user_id: 'test-user-id', default_variant: {} },
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
  it('renders a favorite toggle for each food row', async () => {
    renderWithClient(<FoodDatabaseManager />);

    expect(screen.getAllByText('Apple').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Banana').length).toBeGreaterThan(0);

    // Favorites resolve empty, so every row shows the "Add to favorites" star.
    // DataTable renders each row in both a desktop and a mobile layout, so the
    // count is >= the food count rather than exact.
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: 'Add to favorites' }).length
      ).toBeGreaterThanOrEqual(2);
    });
  });
});
