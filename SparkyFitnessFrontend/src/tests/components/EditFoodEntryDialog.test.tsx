import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EditFoodEntryDialog from '@/pages/Diary/EditFoodEntryDialog';
import type { FoodEntry } from '@/types/food';
import type { MealTypeDefinition } from '@/types/diary';

const mockUpdateFoodEntry = jest.fn();
const mockCreateVariant = jest.fn();

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'DEBUG',
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
    nutrientDisplayPreferences: [],
  }),
}));

jest.mock('@/utils/logging', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({
    data: [],
  }),
}));

jest.mock('@/hooks/Foods/useFoods', () => ({
  useFoodView: () => ({
    data: {
      id: 'food-1',
      name: 'Cornstarch',
      is_custom: true,
      default_variant: {
        id: 'default-variant',
        serving_size: 10,
        serving_unit: 'g',
        calories: 10,
        protein: 1,
        carbs: 1,
        fat: 1,
      },
    },
    isLoading: false,
  }),
}));

jest.mock('@/hooks/Foods/useFoodVariants', () => ({
  useFoodVariants: () => ({
    data: [],
    isLoading: false,
  }),
  useCreateFoodVariantMutation: () => ({
    isPending: false,
    mutateAsync: mockCreateVariant,
  }),
}));

jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useUpdateFoodEntryMutation: () => ({
    mutateAsync: mockUpdateFoodEntry,
  }),
}));

jest.mock('@/pages/Diary/NutrientsGrid', () => ({
  NutrientGrid: () => <div data-testid="nutrient-grid" />,
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

const mealTypes: MealTypeDefinition[] = [
  {
    id: 'meal-1',
    name: 'Breakfast',
    sort_order: 1,
    user_id: null,
  },
];

const entry: FoodEntry = {
  id: 'entry-1',
  food_id: 'food-1',
  meal_type: 'Breakfast',
  meal_type_id: 'meal-1',
  quantity: 1,
  unit: 'g',
  variant_id: 'default-variant',
  food_name: 'Cornstarch',
  entry_date: '2026-04-18',
};

describe('EditFoodEntryDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the manual warning, hides preview, and disables save for unresolved incompatible units', async () => {
    render(
      <EditFoodEntryDialog
        entry={entry}
        open={true}
        onOpenChange={jest.fn()}
        availableMealTypes={mealTypes}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Cornstarch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^tsp$/i }));

    await waitFor(() => {
      expect(screen.getByText(/These units can/i)).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/e\.g\. 1/i)).toBeInTheDocument();
    expect(screen.queryByTestId('nutrient-grid')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Save Changes/i })
    ).toBeDisabled();
  });
});
