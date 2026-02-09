import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealBuilder from '@/components/MealBuilder';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: string | Record<string, unknown>) => {
      if (typeof defaultValueOrOpts === 'string') return defaultValueOrOpts;
      if (defaultValueOrOpts && typeof defaultValueOrOpts === 'object' && 'defaultValue' in defaultValueOrOpts) {
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
  usePreferences: () => ({ loggingLevel: 'debug', foodDisplayLimit: 100 }),
}));

// Mock toast
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

// Mock logging
jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock services
const mockCreateMeal = jest.fn();
const mockUpdateMeal = jest.fn();
const mockGetMealById = jest.fn();
jest.mock('@/services/mealService', () => ({
  createMeal: (...args: unknown[]) => mockCreateMeal(...args),
  updateMeal: (...args: unknown[]) => mockUpdateMeal(...args),
  getMealById: (...args: unknown[]) => mockGetMealById(...args),
}));

jest.mock('@/services/foodService', () => ({
  searchFoods: jest.fn(),
}));

jest.mock('@/services/foodEntryService', () => ({
  createFoodEntryMeal: jest.fn(),
  updateFoodEntryMeal: jest.fn(),
  getFoodEntryMealWithComponents: jest.fn(),
}));

// Mock complex sub-components as simple stubs
jest.mock('@/components/FoodUnitSelector', () => {
  return function MockFoodUnitSelector() {
    return <div data-testid="food-unit-selector">FoodUnitSelector</div>;
  };
});

jest.mock('../../components/FoodSearchDialog', () => {
  return function MockFoodSearchDialog() {
    return <div data-testid="food-search-dialog">FoodSearchDialog</div>;
  };
});

const sampleFoods = [
  {
    food_id: 'food1',
    food_name: 'Apple',
    variant_id: 'v1',
    quantity: 1,
    unit: 'piece',
    calories: 95,
    protein: 0.5,
    carbs: 25,
    fat: 0.3,
    serving_size: 1,
    serving_unit: 'piece',
  },
];

describe('MealBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders in create mode with correct labels', () => {
    render(<MealBuilder />);

    expect(screen.getByText('Meal Name')).toBeInTheDocument();
    expect(screen.getByText('Description (Optional)')).toBeInTheDocument();
    expect(screen.getByText('Share with Public')).toBeInTheDocument();
    expect(screen.getByText('Save Meal')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Add Food')).toBeInTheDocument();
  });

  it('shows empty state message when no foods added', () => {
    render(<MealBuilder />);
    expect(screen.getByText('No foods added to this meal yet.')).toBeInTheDocument();
  });

  it('shows validation error when saving with no foods', () => {
    render(<MealBuilder />);
    fireEvent.click(screen.getByText('Save Meal'));

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'A meal must contain at least one food item.',
      variant: 'destructive',
    });
  });

  it('shows validation error for empty meal name when foods exist', async () => {
    render(<MealBuilder initialFoods={sampleFoods} />);

    // useEffect sets name to 'Logged Meal' — wait for it, then clear it
    await waitFor(() => {
      expect(screen.getByLabelText('Meal Name')).toHaveValue('Logged Meal');
    });
    fireEvent.change(screen.getByLabelText('Meal Name'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save Meal'));

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Meal name cannot be empty.',
      variant: 'destructive',
    });
  });

  it('loads existing meal data in edit mode', async () => {
    const mockMeal = {
      id: 'meal1',
      name: 'Test Meal',
      description: 'A test description',
      is_public: true,
      serving_size: 1,
      serving_unit: 'serving',
      foods: sampleFoods,
    };
    mockGetMealById.mockResolvedValue(mockMeal);

    render(<MealBuilder mealId="meal1" />);

    await waitFor(() => {
      expect(mockGetMealById).toHaveBeenCalledWith('test-user-id', 'meal1');
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Meal')).toBeInTheDocument();
      expect(screen.getByDisplayValue('A test description')).toBeInTheDocument();
      expect(screen.getByText('Apple')).toBeInTheDocument();
    });
  });

  it('calls createMeal on save with valid data', async () => {
    const mockResult = { id: 'new-meal', name: 'My Meal', foods: sampleFoods };
    mockCreateMeal.mockResolvedValue(mockResult);
    const onSave = jest.fn();

    render(<MealBuilder initialFoods={sampleFoods} onSave={onSave} />);

    // Set meal name
    fireEvent.change(screen.getByLabelText('Meal Name'), { target: { value: 'My Meal' } });
    fireEvent.click(screen.getByText('Save Meal'));

    await waitFor(() => {
      expect(mockCreateMeal).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ name: 'My Meal' }),
      );
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(mockResult);
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Meal created successfully!',
      });
    });
  });

  it('calls updateMeal when saving in edit mode', async () => {
    const mockMeal = {
      id: 'meal1',
      name: 'Original',
      description: '',
      is_public: false,
      serving_size: 1,
      serving_unit: 'serving',
      foods: sampleFoods,
    };
    mockGetMealById.mockResolvedValue(mockMeal);
    const mockUpdated = { ...mockMeal, name: 'Updated' };
    mockUpdateMeal.mockResolvedValue(mockUpdated);
    const onSave = jest.fn();

    render(<MealBuilder mealId="meal1" onSave={onSave} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Original')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Meal Name'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByText('Save Meal'));

    await waitFor(() => {
      expect(mockUpdateMeal).toHaveBeenCalledWith(
        'test-user-id',
        'meal1',
        expect.objectContaining({ name: 'Updated' }),
      );
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(mockUpdated);
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Meal updated successfully!',
      });
    });
  });
});
