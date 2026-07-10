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

const mockTranslations: Record<string, string> = {
  'foodUnitSelector.addTitle': 'إضافة {{foodName}} للوجبة',
  'foodUnitSelector.addDescription': 'حدد الكمية والوحدة للصنف.',
  'foodUnitSelector.loadingUnits': 'جاري تحميل الوحدات…',
  'foodUnitSelector.quantity': 'الكمية',
  'foodUnitSelector.unit': 'الوحدة',
  'foodUnitSelector.manualConversionHelp':
    'ما نقدر نحوّل هالوحدتين تلقائيًا. أدخل كم {{baseUnit}} في {{pendingUnit}} واحد.',
  'foodUnitSelector.conversionEquation': '1 {{pendingUnit}} = ؟ {{baseUnit}}',
  'foodUnitSelector.nutritionFor': 'القيم الغذائية لـ {{quantity}} {{unit}}:',
  'foodUnitSelector.addToMeal': 'إضافة للوجبة',
  'common.cancel': 'إلغاء',
  'units.gram': 'غ',
  'units.teaspoon': 'ملعقة صغيرة',
  'units.tablespoon': 'ملعقة كبيرة',
  'units.cup': 'كوب',
  'units.milliliter': 'مل',
  'units.ounce': 'أونصة',
  'units.serving': 'حصة',
  'units.piece': 'حبة',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: string | Record<string, unknown>) => {
      const translation = mockTranslations[key];
      if (translation) {
        const options =
          typeof defaultValueOrOpts === 'object' ? defaultValueOrOpts : {};
        return translation.replace(/{{(\w+)}}/g, (_, token: string) =>
          String(options[token] ?? '')
        );
      }
      if (typeof defaultValueOrOpts === 'string') return defaultValueOrOpts;
      if (
        defaultValueOrOpts &&
        typeof defaultValueOrOpts.defaultValue === 'string'
      ) {
        return defaultValueOrOpts.defaultValue;
      }
      return key;
    },
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
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
        screen.getByRole('button', { name: 'ملعقة صغيرة' })
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

    fireEvent.click(screen.getByRole('button', { name: 'ملعقة صغيرة' }));

    await waitFor(() => {
      expect(screen.getByText(/ما نقدر نحوّل هالوحدتين/)).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/e\.g\. 1/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/القيم الغذائية لـ .* ملعقة صغيرة:/)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة للوجبة' })).toBeDisabled();
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

    fireEvent.click(screen.getByRole('button', { name: 'ملعقة صغيرة' }));
    fireEvent.click(screen.getByRole('button', { name: 'ملعقة كبيرة' }));

    await waitFor(() => {
      expect(screen.getByLabelText('1 ملعقة كبيرة = ؟ غ')).toHaveValue(null);
    });

    expect(
      screen.queryByText(/القيم الغذائية لـ .* ملعقة كبيرة:/)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة للوجبة' })).toBeDisabled();
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

    const tspItem = screen.getByRole('button', { name: 'ملعقة صغيرة' });

    expect(tspItem.querySelector('svg.text-green-500')).not.toBeNull();

    fireEvent.click(tspItem);

    await waitFor(() => {
      expect(
        screen.getByText(/القيم الغذائية لـ .* ملعقة صغيرة:/)
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/ما نقدر نحوّل هالوحدتين/)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة للوجبة' })).toBeEnabled();
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

    const tbspItem = screen.getByRole('button', { name: 'ملعقة كبيرة' });

    expect(tbspItem.querySelector('svg.text-green-500')).toBeNull();
  });
});
