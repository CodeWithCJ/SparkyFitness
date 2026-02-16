import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealManagement from '@/pages/Foods/MealManagement';
import { renderWithClient } from '../test-utils';

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
        return defaultValueOrOpts.defaultValue as string;
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
    foodDisplayLimit: 100,
    nutrientDisplayPreferences: [
      {
        view_group: 'quick_info',
        platform: 'desktop',
        visible_nutrients: ['calories', 'protein', 'carbs', 'fat'],
      },
    ],
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
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

// Mock MealBuilder sub-component
jest.mock('@/components/MealBuilder', () => {
  return function MockMealBuilder() {
    return <div data-testid="meal-builder">MealBuilder</div>;
  };
});

describe('MealManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      expect(screen.getByText('Breakfast Bowl')).toBeInTheDocument();
      expect(screen.getByText('Protein Shake')).toBeInTheDocument();
    });
  });
});
