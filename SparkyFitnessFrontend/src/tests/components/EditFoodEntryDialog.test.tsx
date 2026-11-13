import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EditFoodEntryDialog from '@/pages/Diary/EditFoodEntryDialog';
import type { FoodEntry } from '@/types/food';
import type { MealTypeDefinition } from '@/types/diary';

const mockUpdateFoodEntry = jest.fn();
const mockCreateVariant = jest.fn();
let mockVariantsData: unknown[] = [];
let mockFoodData: unknown;

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
    data: mockFoodData,
    isLoading: false,
  }),
}));

jest.mock('@/hooks/Foods/useFoodVariants', () => ({
  useFoodVariants: () => ({
    data: mockVariantsData,
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
  // Used by the per-entry photo override control.
  useSetFoodEntryImagesMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useSetFoodEntryMealImagesMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
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

jest.mock('lucide-react', () => {
  const actual = jest.requireActual('lucide-react');

  return {
    ...actual,
    Check: ({ className }: { className?: string }) => (
      <svg data-testid="check-icon" className={className} />
    ),
    Sparkles: ({
      className,
      ...props
    }: React.SVGProps<SVGSVGElement> & { className?: string }) => (
      <svg data-testid="sparkles-icon" className={className} {...props} />
    ),
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
    mockFoodData = {
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
    };
    mockVariantsData = [];
  });

  it('saves arithmetic as a numeric quantity when editing a diary entry', async () => {
    render(
      <EditFoodEntryDialog
        entry={entry}
        open
        onOpenChange={jest.fn()}
        availableMealTypes={mealTypes}
      />
    );
    const input = await screen.findByLabelText(/^Quantity$/i);
    fireEvent.change(input, { target: { value: '50+10' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() =>
      expect(mockUpdateFoodEntry).toHaveBeenCalledWith({
        id: 'entry-1',
        data: expect.objectContaining({ quantity: 60 }),
      })
    );
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

  it('shows AI provenance on saved variants and hides compatible checks when an AI variant is selected', async () => {
    mockVariantsData = [
      {
        id: 'cup-ai',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 30,
        protein: 1,
        carbs: 1,
        fat: 1,
        source: 'ai_estimate',
        ai_confidence: 'medium',
      },
    ];

    render(
      <EditFoodEntryDialog
        entry={{ ...entry, variant_id: 'cup-ai', unit: 'cup' }}
        open={true}
        onOpenChange={jest.fn()}
        availableMealTypes={mealTypes}
      />
    );

    await waitFor(() => {
      expect(
        screen.getAllByLabelText(/AI estimate \(Fair confidence\)/i).length
      ).toBeGreaterThan(0);
    });

    const tbspButton = screen.getByRole('button', { name: /^tbsp$/i });
    expect(tbspButton.querySelector('svg.text-green-500')).toBeNull();
  });

  it('shows provider serving descriptions in the variant picker', async () => {
    mockFoodData = {
      id: 'food-1',
      name: 'Apple',
      is_custom: true,
      default_variant: {
        id: 'default-variant',
        serving_size: 1,
        serving_unit: 'Whole',
        serving_description: '1 Whole (200g)',
        calories: 50,
        protein: 1,
        carbs: 10,
        fat: 1,
      },
    };

    render(
      <EditFoodEntryDialog
        entry={{
          ...entry,
          food_name: 'Apple',
          unit: 'Whole',
          variant_id: 'default-variant',
        }}
        open={true}
        onOpenChange={jest.fn()}
        availableMealTypes={mealTypes}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /1 Whole \(200g\)/i })
      ).toBeInTheDocument();
    });
  });

  it('shows deleted food notice and uses snapshot details when food is deleted or not found', async () => {
    mockFoodData = null;
    mockVariantsData = [];

    const deletedFoodEntry: FoodEntry = {
      id: 'entry-deleted',
      food_id: 'deleted-food-id',
      meal_type: 'Breakfast',
      meal_type_id: 'meal-1',
      quantity: 100,
      unit: 'g',
      variant_id: 'var-1',
      food_name: 'Deleted Idli',
      brand_name: 'Deep',
      serving_size: 100,
      calories: 141,
      protein: 3.5,
      carbs: 28.2,
      fat: 1.8,
      entry_date: '2026-09-12',
    };

    const mockOnOpenChange = jest.fn();

    render(
      <EditFoodEntryDialog
        entry={deletedFoodEntry}
        open={true}
        onOpenChange={mockOnOpenChange}
        availableMealTypes={mealTypes}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Deleted Idli')).toBeInTheDocument();
    });

    expect(screen.getByText('Deep')).toBeInTheDocument();

    // Verify deleted food note is shown instead of latestVariantNote
    expect(
      screen.getByText(
        /This food is no longer in your food database\. Showing details saved in this diary entry\./i
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Note: Updating this entry will use the latest available variant details/i
      )
    ).not.toBeInTheDocument();

    // Verify nutrient grid is rendered using snapshot data
    expect(screen.getByTestId('nutrient-grid')).toBeInTheDocument();

    // Form can be saved with snapshot variant
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mockUpdateFoodEntry).toHaveBeenCalledWith({
        id: 'entry-deleted',
        data: expect.objectContaining({
          quantity: 100,
          unit: 'g',
          meal_type_id: 'meal-1',
        }),
      });
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
