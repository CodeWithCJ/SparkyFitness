import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import type { Food, FoodVariant } from '@/types/food';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const mockFetchQuery = jest.fn();
const mockMutateAsync = jest.fn();
const mockQueryClient = {
  fetchQuery: mockFetchQuery,
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

// The dialog header carries a favorite star. Stub its hooks: this suite's
// react-query mock deliberately exposes only useQueryClient, and the star's
// behaviour is covered by its own tests.
jest.mock('@/hooks/Foods/useFavorites', () => ({
  useFavoritesQuery: () => ({ data: undefined }),
  useToggleFavoriteMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'DEBUG',
    energyUnit: 'kcal' as const,
    convertEnergy: (value: number) => value,
    // AI conversions gated off in this manual-flow test suite.
    aiAssistedConversions: false,
  }),
}));

// AI gate hooks — return inert data so the AiEstimateSection never renders in
// these tests, which focus on the manual conversion flow.
jest.mock('@/hooks/AI/useAIServiceSettings', () => ({
  useActiveAIService: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/hooks/AI/useUserAiConfigAllowed', () => ({
  useUserAiConfigAllowed: () => ({ data: false, isLoading: false }),
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
  const renderSelector = async (
    food: Food,
    props?: Partial<React.ComponentProps<typeof FoodUnitSelector>>
  ) => {
    render(
      <FoodUnitSelector
        food={food}
        open={true}
        onOpenChange={jest.fn()}
        onSelect={jest.fn()}
        {...props}
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

  it('clears the entry note when reopened for another food', async () => {
    // Diary never clears `selectedFood`, so this dialog stays mounted between
    // foods. A note typed for one food must not be sitting there for the next.
    const food = createFood(
      createVariant({ id: 'v1', serving_size: 10, serving_unit: 'g' })
    );
    mockFetchQuery.mockResolvedValue([]);

    const { rerender } = render(
      <FoodUnitSelector
        food={food}
        open={true}
        onOpenChange={jest.fn()}
        onSelect={jest.fn()}
      />
    );
    await waitFor(() => expect(mockFetchQuery).toHaveBeenCalled());

    const noteBox = screen.getByLabelText(/note for this entry/i);
    fireEvent.change(noteBox, { target: { value: 'ate half of it' } });
    expect(noteBox).toHaveValue('ate half of it');

    const reopen = (open: boolean, nextFood: Food) =>
      rerender(
        <FoodUnitSelector
          food={nextFood}
          open={open}
          onOpenChange={jest.fn()}
          onSelect={jest.fn()}
        />
      );

    reopen(false, food);
    const otherFood = {
      // A distinct id, so this really is a different food and not the same one
      // reopened — the fixture factory hardcodes 'food-1'.
      ...createFood(
        createVariant({ id: 'v2', serving_size: 10, serving_unit: 'g' })
      ),
      id: 'food-2',
    };
    reopen(true, otherFood);

    await waitFor(() =>
      expect(screen.getByLabelText(/note for this entry/i)).toHaveValue('')
    );
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

  it('shows provider serving descriptions with gram or milliliter amounts', async () => {
    const food = createFood(
      createVariant({
        id: 'default-variant',
        serving_size: 1,
        serving_unit: 'glass',
        serving_description: '1 glass (200 ml)',
      })
    );

    mockFetchQuery.mockResolvedValue([]);

    await renderSelector(food);

    expect(
      screen.getByRole('button', { name: /1 glass \(200 ml\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nutrition for 1 glass \(200 ml\):/i)
    ).toBeInTheDocument();
  });

  it('allows clearing and replacing the quantity without forcing zero', async () => {
    const food = createFood(
      createVariant({
        id: 'default-variant',
        serving_size: 3,
        serving_unit: 'g',
      })
    );

    mockFetchQuery.mockResolvedValue([]);

    await renderSelector(food);

    const quantityInput = screen.getByLabelText(/^Quantity$/i);
    expect(quantityInput).toHaveValue(3);

    fireEvent.change(quantityInput, { target: { value: '' } });
    expect(quantityInput).toHaveValue(null);

    fireEvent.change(quantityInput, { target: { value: '1' } });
    expect(quantityInput).toHaveValue(1);
  });

  it('submits fractional quantities through the selector', async () => {
    const food = createFood(
      createVariant({
        id: 'default-variant',
        serving_size: 1,
        serving_unit: 'g',
      })
    );
    const onSelect = jest.fn();

    mockFetchQuery.mockResolvedValue([]);

    await renderSelector(food, { onSelect });

    const quantityInput = screen.getByLabelText(/^Quantity$/i);
    fireEvent.change(quantityInput, { target: { value: '0.25' } });
    expect(quantityInput).toHaveValue(0.25);

    fireEvent.click(screen.getByRole('button', { name: /Add to Meal/i }));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    expect(onSelect.mock.calls[0]?.[1]).toBe(0.25);
  });

  it('keeps autofocus and selection when using NumericInput', async () => {
    const food = createFood(
      createVariant({
        id: 'default-variant',
        serving_size: 3,
        serving_unit: 'g',
      })
    );
    const selectSpy = jest.spyOn(HTMLInputElement.prototype, 'select');

    mockFetchQuery.mockResolvedValue([]);

    await renderSelector(food);

    const quantityInput = screen.getByLabelText(/^Quantity$/i);
    await waitFor(() => {
      expect(quantityInput).toHaveFocus();
      expect(selectSpy).toHaveBeenCalled();
    });

    selectSpy.mockRestore();
  });

  it('does not show compatible-unit checks when the selected saved variant is AI-estimated', async () => {
    const food = createFood(
      createVariant({
        id: 'default-variant',
        serving_size: 10,
        serving_unit: 'g',
      })
    );

    mockFetchQuery.mockResolvedValue([
      createVariant({
        id: 'cup-ai',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 30,
        source: 'ai_estimate',
        ai_confidence: 'medium',
      }),
    ]);

    await renderSelector(food, { initialVariantId: 'cup-ai' });

    const tbspItem = screen.getByRole('button', { name: /^tbsp$/i });

    expect(tbspItem.querySelector('svg.text-green-500')).toBeNull();
  });

  it('hides an AI badge when a saved variant has an unrecognized confidence', async () => {
    const food = createFood(
      createVariant({
        id: 'default-variant',
        serving_size: 10,
        serving_unit: 'g',
      })
    );

    mockFetchQuery.mockResolvedValue([
      createVariant({
        id: 'cup-ai',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 30,
        source: 'ai_estimate',
        // API data can be malformed despite the TypeScript type at this boundary.
        ai_confidence: 'unknown' as FoodVariant['ai_confidence'],
      }),
    ]);

    await renderSelector(food);

    expect(screen.queryByLabelText(/AI estimate/i)).not.toBeInTheDocument();
  });
});
