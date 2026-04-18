import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import type { Food, FoodVariant } from '@/types/food';

const mockFetchQuery = jest.fn();
const mockMutateAsync = jest.fn();
const mockQueryClient = {
  fetchQuery: mockFetchQuery,
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'DEBUG',
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
  }),
}));

jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@/hooks/Foods/useFoodVariants', () => ({
  foodVariantsOptions: (foodId: string) => ({
    queryKey: ['food-variants', foodId],
  }),
  useCreateFoodVariantMutation: () => ({
    isPending: false,
    mutateAsync: mockMutateAsync,
  }),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/components/ui/select', () => {
  const SelectContext = React.createContext<(value: string) => void>(() => {});

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={onValueChange ?? (() => {})}>
        {children}
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const onValueChange = React.useContext(SelectContext);

      return (
        <button
          type="button"
          data-value={value}
          onClick={() => onValueChange(value)}
        >
          {children}
        </button>
      );
    },
    SelectSeparator: () => <div data-testid="select-separator" />,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: () => <span />,
  };
});

jest.mock('lucide-react', () => {
  const actual = jest.requireActual('lucide-react');

  return {
    ...actual,
    Check: ({ className }: { className?: string }) => (
      <svg data-testid="check-icon" className={className} />
    ),
  };
});

const createVariant = (overrides: Partial<FoodVariant>): FoodVariant => ({
  id: 'variant-id',
  serving_size: 1,
  serving_unit: 'g',
  calories: 10,
  protein: 1,
  carbs: 1,
  fat: 1,
  custom_nutrients: {},
  ...overrides,
});

const createFood = (defaultVariant: FoodVariant): Food => ({
  id: 'food-1',
  name: 'Cornstarch',
  is_custom: true,
  default_variant: defaultVariant,
});

describe('FoodUnitSelector', () => {
  const renderSelector = async (food: Food) => {
    render(
      <FoodUnitSelector
        food={food}
        open={true}
        onOpenChange={jest.fn()}
        onSelect={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(mockFetchQuery).toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: /^tsp$/i })
      ).toBeInTheDocument();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the manual warning, hides preview, and disables save for unresolved incompatible units', async () => {
    const food = createFood(
      createVariant({
        id: 'default-variant',
        serving_size: 10,
        serving_unit: 'g',
      })
    );

    mockFetchQuery.mockResolvedValue([]);

    await renderSelector(food);

    fireEvent.click(screen.getByRole('button', { name: /^tsp$/i }));

    await waitFor(() => {
      expect(screen.getByText(/These units can/i)).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/e\.g\. 1/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Nutrition for .* tsp:/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add to Meal/i })).toBeDisabled();
  });

  it('does not derive another incompatible unit before the first manual unit is saved', async () => {
    const food = createFood(
      createVariant({
        id: 'default-variant',
        serving_size: 10,
        serving_unit: 'g',
      })
    );

    mockFetchQuery.mockResolvedValue([]);

    await renderSelector(food);

    fireEvent.click(screen.getByRole('button', { name: /^tsp$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^tbsp$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/1 tbsp = \? g/i)).toHaveValue(null);
    });

    expect(
      screen.queryByText(/Nutrition for .* tbsp:/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add to Meal/i })).toBeDisabled();
  });

  it('uses a saved compatible variant immediately after reopen-style loading', async () => {
    const food = createFood(
      createVariant({
        id: 'default-variant',
        serving_size: 10,
        serving_unit: 'g',
      })
    );

    mockFetchQuery.mockResolvedValue([
      createVariant({
        id: 'tbsp-variant',
        serving_size: 1,
        serving_unit: 'tbsp',
        calories: 30,
      }),
    ]);

    await renderSelector(food);

    const tspItem = screen.getByRole('button', { name: /^tsp$/i });

    expect(tspItem.querySelector('svg.text-green-500')).not.toBeNull();

    fireEvent.click(tspItem);

    await waitFor(() => {
      expect(screen.getByText(/Nutrition for .* tsp:/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/These units can/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add to Meal/i })).toBeEnabled();
  });
});
