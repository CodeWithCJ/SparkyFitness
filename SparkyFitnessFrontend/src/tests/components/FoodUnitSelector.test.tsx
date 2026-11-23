import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
    getEnergyUnitString: (unit: string) => unit,
    formatDate: (date: string) => `on-${date}`,
    // AI conversions gated off in this manual-flow test suite.
    aiAssistedConversions: false,
  }),
}));

const mockUseLastCookedFoodEntry = jest.fn();
jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useLastCookedFoodEntry: (...args: unknown[]) =>
    mockUseLastCookedFoodEntry(...args),
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

  it('preserves an edited recipe amount across gram variants and converts that amount to kg', async () => {
    const food = createFood(
      createVariant({ id: 'base', serving_size: 100, serving_unit: 'g' })
    );
    mockFetchQuery.mockResolvedValue([
      createVariant({
        id: 'other-g',
        serving_size: 50,
        serving_unit: 'g',
        serving_description: 'Other grams',
      }),
      createVariant({ id: 'kg', serving_size: 1, serving_unit: 'kg' }),
    ]);
    await renderSelector(food, {
      initialQuantity: 600,
      initialUnit: 'g',
      preserveInitialAmountUnit: true,
    });
    const input = screen.getByLabelText(/^Quantity$/i);
    expect(input).toHaveValue('600');
    fireEvent.change(input, { target: { value: '700' } });
    fireEvent.click(screen.getByRole('button', { name: /Other grams/ }));
    expect(input).toHaveValue('700');
    fireEvent.click(screen.getByRole('button', { name: /^1 kg$/ }));
    expect(input).toHaveValue('0.7');
  });

  it('initializes a recipe ml amount only from an explicit gram-per-ml factor and preserves edits', async () => {
    const food = createFood(
      createVariant({ id: 'base', serving_size: 100, serving_unit: 'g' })
    );
    mockFetchQuery.mockResolvedValue([]);
    await renderSelector(food, {
      initialQuantity: 600,
      initialUnit: 'g',
      preserveInitialAmountUnit: true,
    });
    fireEvent.click(screen.getByRole('button', { name: /^ml$/ }));
    const input = screen.getByLabelText(/^Quantity$/i);
    expect(input).toHaveValue('');
    fireEvent.change(screen.getByLabelText(/1 ml =/), {
      target: { value: '2' },
    });
    expect(input).toHaveValue('300');
    fireEvent.change(input, { target: { value: '350' } });
    fireEvent.change(screen.getByLabelText(/1 ml =/), {
      target: { value: '3' },
    });
    expect(input).toHaveValue('350');
  });

  it.each(['', 'scoop'])(
    'keeps the recipe custom-unit quantity while editing its name from "%s"',
    async (initialName) => {
      const food = createFood(
        createVariant({ id: 'base', serving_size: 100, serving_unit: 'g' })
      );
      const onSelect = jest.fn();
      mockFetchQuery.mockResolvedValue([]);
      mockMutateAsync.mockResolvedValue({ id: 'custom-variant' });
      await renderSelector(food, {
        initialQuantity: 600,
        initialUnit: 'g',
        preserveInitialAmountUnit: true,
        onSelect,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Custom unit...' }));
      const unitName = screen.getByLabelText('Unit name');
      if (initialName)
        fireEvent.change(unitName, { target: { value: initialName } });
      const input = screen.getByLabelText(/^Quantity$/i);
      fireEvent.change(input, { target: { value: '3' } });
      expect(input).toHaveValue('3');
      for (const name of ['scoops', '', 'scoopful']) {
        fireEvent.change(unitName, { target: { value: name } });
        expect(input).toHaveValue('3');
        expect(
          screen.getByRole('button', { name: /Update Food/i })
        ).toBeDisabled();
      }
      fireEvent.change(screen.getByLabelText(/1 scoopful =/), {
        target: { value: '50' },
      });
      expect(input).toHaveValue('3');
      const save = screen.getByRole('button', { name: /Update Food/i });
      expect(save).toBeEnabled();
      fireEvent.click(save);
      await waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith(
          food,
          3,
          'scoopful',
          expect.objectContaining({
            id: 'custom-variant',
            serving_size: 1,
            serving_unit: 'scoopful',
            calories: 5,
          }),
          expect.any(String),
          null,
          null,
          null
        )
      );
    }
  );

  it('does not apply a gram-per-ml factor to a source already measured in ml', async () => {
    const food = createFood(
      createVariant({ id: 'base', serving_size: 100, serving_unit: 'g' })
    );
    mockFetchQuery.mockResolvedValue([]);
    await renderSelector(food, {
      initialQuantity: 600,
      initialUnit: 'ml',
      preserveInitialAmountUnit: true,
    });
    fireEvent.click(screen.getByRole('button', { name: /^ml$/ }));
    fireEvent.change(screen.getByLabelText(/1 ml =/), {
      target: { value: '2' },
    });
    expect(screen.getByLabelText(/^Quantity$/i)).toHaveValue('600');
  });

  it.each([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'keeps unknown recipe protein unknown in the selector (%s)',
    async (protein) => {
      const variant = {
        ...createVariant({ id: 'base', serving_size: 100 }),
        protein,
      } as unknown as FoodVariant;
      mockFetchQuery.mockResolvedValue([variant]);
      await renderSelector(createFood(variant), {
        initialQuantity: 600,
        initialUnit: 'g',
        preserveInitialAmountUnit: true,
      });
      expect(screen.getByText(/\?g protein/i)).toBeInTheDocument();
      expect(screen.queryByText(/0.0g protein/i)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^ml$/ }));
      fireEvent.change(screen.getByLabelText(/1 ml =/), {
        target: { value: '2' },
      });
      expect(screen.getByText(/\?g protein/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Update Food/i })
      ).toBeDisabled();
    }
  );

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
    expect(quantityInput).toHaveValue('3');

    fireEvent.change(quantityInput, { target: { value: '' } });
    expect(quantityInput).toHaveValue('');

    fireEvent.change(quantityInput, { target: { value: '1' } });
    expect(quantityInput).toHaveValue('1');
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
    expect(quantityInput).toHaveValue('0.25');

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

  it('submits the calculated food quantity without requiring blur', async () => {
    const onSelect = jest.fn();
    await renderSelector(createFood(createVariant({})), { onSelect });
    const input = screen.getByLabelText(/^Quantity$/i);
    fireEvent.change(input, { target: { value: '30*5' } });
    fireEvent.click(screen.getByRole('button', { name: /Add to Meal/i }));
    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(onSelect.mock.calls[0]?.[1]).toBe(150);
  });

  it('blocks an invalid calculation from logging the previous quantity', async () => {
    const onSelect = jest.fn();
    await renderSelector(createFood(createVariant({})), { onSelect });
    const input = screen.getByLabelText(/^Quantity$/i);
    fireEvent.change(input, { target: { value: '1/0' } });
    fireEvent.click(screen.getByRole('button', { name: /Add to Meal/i }));
    expect(input).toBeInvalid();
    expect(onSelect).not.toHaveBeenCalled();
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

  describe('Weighed it cooked (#3534)', () => {
    const rice = () =>
      createFood(
        createVariant({
          id: 'rice-100g',
          serving_size: 100,
          serving_unit: 'g',
          calories: 360,
        })
      );

    beforeEach(() => {
      mockFetchQuery.mockResolvedValue([]);
      mockUseLastCookedFoodEntry.mockReturnValue({ data: null });
    });

    it('is not offered unless the caller turns it on', async () => {
      await renderSelector(rice());
      expect(
        screen.queryByRole('switch', { name: 'Weighed it cooked' })
      ).not.toBeInTheDocument();
      expect(mockUseLastCookedFoodEntry).not.toHaveBeenCalled();
    });

    it('is not offered for a non-weight unit', async () => {
      const milk = createFood(
        createVariant({ id: 'cup', serving_size: 1, serving_unit: 'cup' })
      );
      render(
        <FoodUnitSelector
          food={milk}
          open={true}
          onOpenChange={jest.fn()}
          onSelect={jest.fn()}
          showCookedWeight
        />
      );
      await waitFor(() => expect(mockFetchQuery).toHaveBeenCalled());
      await waitFor(() =>
        expect(screen.getByLabelText(/^Quantity$/i)).toBeInTheDocument()
      );
      expect(
        screen.queryByRole('switch', { name: 'Weighed it cooked' })
      ).not.toBeInTheDocument();
    });

    it('logs the raw weight and the cooked weight eaten from a new batch', async () => {
      const onSelect = jest.fn();
      await renderSelector(rice(), { onSelect, showCookedWeight: true });

      const toggle = screen.getByRole('switch', { name: 'Weighed it cooked' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      // The quantity field is focused when the dialog opens; a click on the
      // switch moves focus away from it, as in a browser.
      act(() => toggle.focus());
      fireEvent.click(toggle);

      fireEvent.change(screen.getByLabelText('Raw weight of batch (g)'), {
        target: { value: '200' },
      });
      fireEvent.change(screen.getByLabelText('Cooked weight of batch (g)'), {
        target: { value: '500' },
      });
      fireEvent.change(screen.getByLabelText('You ate (cooked, g)'), {
        target: { value: '300' },
      });

      // 300 g cooked at 2.5x = 120 g raw; 120 g of 360 kcal/100 g = 432 kcal.
      expect(screen.getByRole('status')).toHaveTextContent(
        '= 120 g raw · 432 kcal'
      );
      expect(screen.getByLabelText(/^Quantity$/i)).toHaveValue('120');

      fireEvent.click(screen.getByRole('button', { name: 'Add to Meal' }));
      await waitFor(() => expect(onSelect).toHaveBeenCalled());
      const args = onSelect.mock.calls[0];
      expect(args[1]).toBe(120);
      expect(args[2]).toBe('g');
      expect(args[7]).toBe(300);
    });

    it('pre-fills the yield from the last cooked entry and lets the person start a new batch', async () => {
      mockUseLastCookedFoodEntry.mockReturnValue({
        data: {
          id: 'entry-9',
          entry_date: '2026-11-13',
          quantity: 120,
          unit: 'g',
          cooked_quantity: 300,
        },
      });
      const onSelect = jest.fn();
      await renderSelector(rice(), { onSelect, showCookedWeight: true });

      expect(mockUseLastCookedFoodEntry).toHaveBeenCalledWith('food-1', true);
      expect(
        screen.getByRole('switch', { name: 'Weighed it cooked' })
      ).toHaveAttribute('aria-checked', 'true');
      expect(
        screen.getByText(
          'Same batch as on on-2026-11-13: 120 g raw → 300 g cooked'
        )
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText('Raw weight of batch (g)')
      ).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Enter the cooked weight you ate.'
      );

      // Leftovers: only the plate weight.
      fireEvent.change(screen.getByLabelText('You ate (cooked, g)'), {
        target: { value: '250' },
      });
      expect(screen.getByLabelText(/^Quantity$/i)).toHaveValue('100');

      fireEvent.click(screen.getByRole('button', { name: 'New batch' }));
      expect(
        screen.getByLabelText('Raw weight of batch (g)')
      ).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Raw weight of batch (g)'), {
        target: { value: '100' },
      });
      fireEvent.change(screen.getByLabelText('Cooked weight of batch (g)'), {
        target: { value: '200' },
      });
      expect(screen.getByLabelText(/^Quantity$/i)).toHaveValue('125');

      fireEvent.click(screen.getByRole('button', { name: 'Add to Meal' }));
      await waitFor(() => expect(onSelect).toHaveBeenCalled());
      expect(onSelect.mock.calls[0][1]).toBe(125);
      expect(onSelect.mock.calls[0][7]).toBe(250);
    });

    it('blocks saving while switched on without a cooked weight', async () => {
      const onSelect = jest.fn();
      await renderSelector(rice(), { onSelect, showCookedWeight: true });
      fireEvent.click(
        screen.getByRole('switch', { name: 'Weighed it cooked' })
      );
      expect(
        screen.getByRole('button', { name: 'Add to Meal' })
      ).toBeDisabled();
      expect(
        screen.getByText('Enter the weights to calculate the raw amount.')
      ).toBeInTheDocument();
    });

    it('sends no cooked weight when the switch stays off', async () => {
      const onSelect = jest.fn();
      await renderSelector(rice(), { onSelect, showCookedWeight: true });
      fireEvent.click(screen.getByRole('button', { name: 'Add to Meal' }));
      await waitFor(() => expect(onSelect).toHaveBeenCalled());
      expect(onSelect.mock.calls[0][7]).toBeNull();
    });
    it('keeps the calculated raw quantity when switching to another gram serving', async () => {
      mockFetchQuery.mockResolvedValue([
        createVariant({
          id: 'rice-50g',
          serving_size: 50,
          serving_unit: 'g',
          calories: 180,
          serving_description: 'Half portion',
        }),
      ]);
      const onSelect = jest.fn();
      await renderSelector(rice(), { onSelect, showCookedWeight: true });
      const toggle = screen.getByRole('switch', { name: 'Weighed it cooked' });
      act(() => toggle.focus());
      fireEvent.click(toggle);
      fireEvent.change(screen.getByLabelText('Raw weight of batch (g)'), {
        target: { value: '200' },
      });
      fireEvent.change(screen.getByLabelText('Cooked weight of batch (g)'), {
        target: { value: '500' },
      });
      fireEvent.change(screen.getByLabelText('You ate (cooked, g)'), {
        target: { value: '250' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Half portion/ }));
      expect(screen.getByLabelText(/^Quantity$/i)).toHaveValue('100');

      fireEvent.click(screen.getByRole('button', { name: 'Add to Meal' }));
      await waitFor(() => expect(onSelect).toHaveBeenCalled());
      expect(onSelect.mock.calls[0][1]).toBe(100);
      expect(onSelect.mock.calls[0][7]).toBe(250);
    });

    it('accepts whole grams in kg', async () => {
      const riceKg = createFood(
        createVariant({
          id: 'rice-kg',
          serving_size: 1,
          serving_unit: 'kg',
          calories: 3600,
        })
      );
      const onSelect = jest.fn();
      await renderSelector(riceKg, { onSelect, showCookedWeight: true });
      const toggle = screen.getByRole('switch', { name: 'Weighed it cooked' });
      act(() => toggle.focus());
      fireEvent.click(toggle);
      fireEvent.change(screen.getByLabelText('Raw weight of batch (kg)'), {
        target: { value: '1' },
      });
      fireEvent.change(screen.getByLabelText('Cooked weight of batch (kg)'), {
        target: { value: '0.5' },
      });
      fireEvent.change(screen.getByLabelText('You ate (cooked, kg)'), {
        target: { value: '0.125' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add to Meal' }));
      await waitFor(() => expect(onSelect).toHaveBeenCalled());
      expect(onSelect.mock.calls[0][1]).toBe(0.25);
      expect(onSelect.mock.calls[0][7]).toBe(0.125);
    });
  });
});
