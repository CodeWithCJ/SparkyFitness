import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VariantCard } from '@/components/FoodSearch/VariantCard';
import type { FoodVariant } from '@/types/food';

const mockTranslations: Record<string, string> = {
  'foodVariant.servingSize': 'حجم الحصة',
  'foodVariant.unitType': 'نوع الوحدة',
  'foodVariant.defaultUnit': 'الوحدة الافتراضية',
  'foodVariant.autoScale': 'تحجيم تلقائي',
  'foodVariant.nutritionPer': 'القيم الغذائية لكل {{size}} {{unit}}',
  'foodVariant.aiEstimate': 'تقدير بثقة {{confidence}}',
  'foodUnitSelector.confidence.high': 'عالية',
  'foodUnitSelector.confidence.medium': 'متوسطة',
  'foodUnitSelector.confidence.low': 'منخفضة',
  'units.gram': 'غ',
  'units.kilogram': 'كجم',
  'units.milligram': 'ملغ',
  'units.ounce': 'أونصة',
  'units.pound': 'رطل',
  'units.milliliter': 'مل',
  'units.liter': 'لتر',
  'units.cup': 'كوب',
  'units.tablespoon': 'ملعقة كبيرة',
  'units.teaspoon': 'ملعقة صغيرة',
  'units.piece': 'حبة',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>) => {
      const fallback =
        typeof fallbackOrOptions === 'string'
          ? fallbackOrOptions
          : typeof fallbackOrOptions?.defaultValue === 'string'
            ? fallbackOrOptions.defaultValue
            : key;
      const options =
        typeof fallbackOrOptions === 'object' ? fallbackOrOptions : {};
      return (mockTranslations[key] ?? fallback).replace(
        /{{(\w+)}}/g,
        (_, token: string) => String(options[token] ?? '')
      );
    },
  }),
}));

jest.mock('@/components/FoodSearch/NutrientFormGrid', () => ({
  NutrientGrid: () => <div data-testid="nutrient-grid" />,
}));

jest.mock('@/components/FoodUnitSelector/AiEstimateSection', () => ({
  AiEstimateSection: () => <div data-testid="ai-estimate-section" />,
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
    SelectGroup: ({ children }: { children: React.ReactNode }) => (
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
          data-testid={`select-unit-${value}`}
          data-value={value}
          onClick={() => onValueChange(value)}
        >
          {children}
        </button>
      );
    },
    SelectLabel: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
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
    Check: ({
      className,
      'data-testid': dataTestId,
    }: {
      className?: string;
      'data-testid'?: string;
    }) => (
      <svg data-testid={dataTestId ?? 'check-icon'} className={className} />
    ),
    Sparkles: ({
      className,
      'aria-label': ariaLabel,
      'data-testid': dataTestId,
    }: {
      className?: string;
      'aria-label'?: string;
      'data-testid'?: string;
    }) => (
      <svg
        data-testid={dataTestId ?? 'sparkles-icon'}
        className={className}
        aria-label={ariaLabel}
      />
    ),
  };
});

const createVariant = (
  overrides: Partial<FoodVariant> = {}
): FoodVariant & { equivalents: [] } => ({
  id: 'variant-1',
  serving_size: 10,
  serving_unit: 'g',
  calories: 100,
  protein: 10,
  carbs: 20,
  fat: 5,
  source: 'manual',
  ai_confidence: null,
  custom_nutrients: {},
  equivalents: [],
  ...overrides,
});

const renderVariantCard = ({
  showCompatibleUnitIndicators = true,
  variantOverrides = {},
  compatibleUnits = [],
  savedAiUnits = [],
  aiEstimatedUnit = null,
  aiEstimateAnchorUnit = null,
  aiEstimatesAvailable = false,
}: {
  showCompatibleUnitIndicators?: boolean;
  variantOverrides?: Partial<FoodVariant>;
  compatibleUnits?: ReadonlyArray<string>;
  savedAiUnits?: ReadonlyArray<{
    unit: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  aiEstimatedUnit?: string | null;
  aiEstimateAnchorUnit?: string | null;
  aiEstimatesAvailable?: boolean;
} = {}) =>
  render(
    <VariantCard
      index={0}
      variant={createVariant(variantOverrides)}
      variantError=""
      visibleNutrients={['calories']}
      energyUnit="kcal"
      convertEnergy={(value) => value}
      showCompatibleUnitIndicators={showCompatibleUnitIndicators}
      food={{ id: 'food-1', name: 'Test Food', brand: null }}
      defaultVariant={createVariant()}
      aiEstimateAnchorUnit={aiEstimateAnchorUnit}
      aiEstimatesAvailable={aiEstimatesAvailable}
      savedAiUnits={savedAiUnits}
      aiEstimatedUnit={aiEstimatedUnit}
      compatibleUnits={compatibleUnits}
      onApplyAiEstimate={jest.fn()}
      onUpdate={jest.fn()}
      onDuplicate={jest.fn()}
      onRemove={jest.fn()}
    />
  );

const getUnitRow = (unit: string) => screen.getByTestId(`select-unit-${unit}`);

describe('VariantCard', () => {
  it('shows a trusted manual-path checkmark for cross-category units', () => {
    renderVariantCard({
      variantOverrides: { serving_unit: 'g', source: 'manual' },
      compatibleUnits: ['piece'],
    });

    expect(
      within(getUnitRow('piece')).getByTestId('compatible-unit-option-0-piece')
    ).toBeInTheDocument();
  });

  it('keeps serving size empty after typing a number and clearing it', () => {
    const StatefulVariantCard = () => {
      const [variant, setVariant] = React.useState(createVariant());

      return (
        <VariantCard
          index={0}
          variant={variant}
          variantError=""
          visibleNutrients={['calories']}
          energyUnit="kcal"
          convertEnergy={(value) => value}
          showCompatibleUnitIndicators={false}
          food={{ id: 'food-1', name: 'Test Food', brand: null }}
          defaultVariant={createVariant()}
          aiEstimateAnchorUnit={null}
          aiEstimatesAvailable={false}
          savedAiUnits={[]}
          aiEstimatedUnit={null}
          compatibleUnits={[]}
          onApplyAiEstimate={jest.fn()}
          onUpdate={(_, field, value) => {
            setVariant((prev) => ({ ...prev, [field]: value }));
          }}
          onDuplicate={jest.fn()}
          onRemove={jest.fn()}
        />
      );
    };

    render(<StatefulVariantCard />);

    const servingSizeInput = screen.getByLabelText('حجم الحصة');

    fireEvent.change(servingSizeInput, { target: { value: '12' } });
    expect(servingSizeInput).toHaveValue(12);

    fireEvent.change(servingSizeInput, { target: { value: '' } });

    expect(servingSizeInput).toHaveDisplayValue('');
  });

  it('shows intra-category math checkmarks for non-AI rows only', () => {
    renderVariantCard({
      variantOverrides: { serving_unit: 'g', source: 'manual' },
      compatibleUnits: ['g', 'kg', 'oz', 'lb'],
    });

    expect(
      screen.getByTestId('compatible-unit-option-0-g')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('compatible-unit-option-0-kg')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('compatible-unit-option-0-oz')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('compatible-unit-option-0-lb')
    ).toBeInTheDocument();
    expect(
      within(getUnitRow('cup')).queryByTestId('compatible-unit-option-0-cup')
    ).not.toBeInTheDocument();
    expect(
      within(getUnitRow('tbsp')).queryByTestId('compatible-unit-option-0-tbsp')
    ).not.toBeInTheDocument();
  });

  it('suppresses intra-category math checkmarks for AI rows without donors', () => {
    renderVariantCard({
      variantOverrides: {
        serving_unit: 'cup',
        source: 'ai_estimate',
        ai_confidence: 'medium',
      },
    });

    expect(
      within(getUnitRow('tbsp')).queryByTestId('compatible-unit-option-0-tbsp')
    ).not.toBeInTheDocument();
    expect(
      within(getUnitRow('tsp')).queryByTestId('compatible-unit-option-0-tsp')
    ).not.toBeInTheDocument();
    expect(
      within(getUnitRow('ml')).queryByTestId('compatible-unit-option-0-ml')
    ).not.toBeInTheDocument();
    expect(
      within(getUnitRow('l')).queryByTestId('compatible-unit-option-0-l')
    ).not.toBeInTheDocument();
  });

  it('shows trusted manual-category checkmarks on AI rows when a manual path exists', () => {
    renderVariantCard({
      variantOverrides: {
        serving_unit: 'cup',
        source: 'ai_estimate',
        ai_confidence: 'medium',
      },
      compatibleUnits: ['g', 'kg', 'oz', 'lb'],
    });

    expect(
      within(getUnitRow('g')).getByTestId('compatible-unit-option-0-g')
    ).toBeInTheDocument();
    expect(
      within(getUnitRow('kg')).getByTestId('compatible-unit-option-0-kg')
    ).toBeInTheDocument();
    expect(
      within(getUnitRow('oz')).getByTestId('compatible-unit-option-0-oz')
    ).toBeInTheDocument();
    expect(
      within(getUnitRow('lb')).getByTestId('compatible-unit-option-0-lb')
    ).toBeInTheDocument();
  });

  it('shows only the sparkle for saved AI units that are not trusted manual paths', () => {
    renderVariantCard({
      variantOverrides: { serving_unit: 'g', source: 'manual' },
      compatibleUnits: [],
      savedAiUnits: [{ unit: 'cup', confidence: 'medium' }],
    });

    expect(
      within(getUnitRow('cup')).queryByTestId('compatible-unit-option-0-cup')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('ai-unit-option-indicator-0-cup')
    ).toBeInTheDocument();
  });

  it('prefers the sparkle over the green check when a saved AI unit also has a trusted manual path', () => {
    renderVariantCard({
      variantOverrides: { serving_unit: 'g', source: 'manual' },
      compatibleUnits: ['cup'],
      savedAiUnits: [{ unit: 'cup', confidence: 'medium' }],
    });

    expect(
      within(getUnitRow('cup')).queryByTestId('compatible-unit-option-0-cup')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('ai-unit-option-indicator-0-cup')
    ).toBeInTheDocument();
  });

  it('hides Convert with AI when the current unit already has a trusted manual path', () => {
    renderVariantCard({
      variantOverrides: { serving_unit: 'cup', source: 'manual' },
      compatibleUnits: ['cup'],
      aiEstimateAnchorUnit: 'g',
      aiEstimatesAvailable: true,
    });

    expect(screen.queryByTestId('ai-estimate-section')).not.toBeInTheDocument();
  });

  it('shows Convert with AI when the current unit does not have a trusted manual path', () => {
    renderVariantCard({
      variantOverrides: { serving_unit: 'cup', source: 'manual' },
      compatibleUnits: [],
      aiEstimateAnchorUnit: 'g',
      aiEstimatesAvailable: true,
    });

    expect(screen.getByTestId('ai-estimate-section')).toBeInTheDocument();
  });

  it('renders the AI provenance badge wording for each confidence tier', () => {
    const screenHigh = renderVariantCard({
      variantOverrides: {
        source: 'ai_estimate',
        ai_confidence: 'high',
      },
      aiEstimatedUnit: 'g',
    });
    expect(screenHigh.getByText('تقدير بثقة عالية')).toBeInTheDocument();
    expect(screenHigh.queryByText(/AI ·/)).not.toBeInTheDocument();
    screenHigh.unmount();

    const screenMedium = renderVariantCard({
      variantOverrides: {
        source: 'ai_estimate',
        ai_confidence: 'medium',
      },
      aiEstimatedUnit: 'g',
    });
    expect(screenMedium.getByText('تقدير بثقة متوسطة')).toBeInTheDocument();
    screenMedium.unmount();

    const screenLow = renderVariantCard({
      variantOverrides: {
        source: 'ai_estimate',
        ai_confidence: 'low',
      },
      aiEstimatedUnit: 'g',
    });
    expect(screenLow.getByText('تقدير بثقة منخفضة')).toBeInTheDocument();
  });

  it('does not render the AI sparkle when there are no saved AI units', () => {
    renderVariantCard({
      variantOverrides: {
        source: 'ai_estimate',
        ai_confidence: 'medium',
      },
    });

    expect(screen.queryByTestId(/ai-unit-option-indicator-/)).toBeNull();
  });

  it('does not render the AI badge for manual variants', () => {
    renderVariantCard({
      variantOverrides: { source: 'manual', ai_confidence: null },
    });

    expect(screen.queryByText(/تقدير/)).not.toBeInTheDocument();
  });

  it('hides the row badge when the row still carries AI provenance but the current unit is not the estimated one', () => {
    renderVariantCard({
      variantOverrides: {
        serving_unit: 'tsp',
        source: 'ai_estimate',
        ai_confidence: 'medium',
      },
      aiEstimatedUnit: 'cup',
    });

    expect(screen.queryByText('تقدير بثقة متوسطة')).not.toBeInTheDocument();
  });
});
