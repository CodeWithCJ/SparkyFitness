import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VariantCard } from '@/components/FoodSearch/VariantCard';
import type { FoodVariant } from '@/types/food';

jest.mock('@/components/FoodSearch/NutrientFormGrid', () => ({
  NutrientGrid: () => <div data-testid="nutrient-grid" />,
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
    Check: ({ className }: { className?: string }) => (
      <svg data-testid="check-icon" className={className} />
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
  custom_nutrients: {},
  equivalents: [],
  ...overrides,
});

const renderVariantCard = (showCompatibleUnitIndicators: boolean) =>
  render(
    <VariantCard
      index={0}
      variant={createVariant()}
      variantError=""
      visibleNutrients={['calories']}
      energyUnit="kcal"
      convertEnergy={(value) => value}
      baseServingUnit="g"
      showCompatibleUnitIndicators={showCompatibleUnitIndicators}
      onUpdate={jest.fn()}
      onDuplicate={jest.fn()}
      onRemove={jest.fn()}
    />
  );

describe('VariantCard', () => {
  it('hides compatible-unit checkmarks for unsaved custom variants', () => {
    renderVariantCard(false);

    expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
  });

  it('shows compatible-unit checkmarks when the variant has a trusted base', () => {
    renderVariantCard(true);

    expect(screen.getAllByTestId('check-icon').length).toBeGreaterThan(0);
  });
});
