import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NutrientGrid } from '@/components/FoodSearch/NutrientFormGrid';
import type { FormFoodVariant } from '@/utils/foodForm';

// Radix Select does not open in jsdom; the stand-in renders every option as a
// button so the test can pick a unit directly.
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
          data-testid={`select-unit-${value}`}
          onClick={() => onValueChange(value)}
        >
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: () => <span />,
  };
});

const variant = {
  id: 'variant-1',
  serving_size: 100,
  serving_unit: 'g',
  sodium: 400,
} as unknown as FormFoodVariant;

const renderGrid = (onUpdate = jest.fn()) => {
  render(
    <NutrientGrid
      variantIndex={0}
      variant={variant}
      visibleNutrients={['sodium']}
      energyUnit="kcal"
      convertEnergy={(value) => value}
      onUpdate={onUpdate}
    />
  );
  return onUpdate;
};

describe('NutrientGrid sodium entry unit', () => {
  it('shows sodium in mg by default and writes sodium straight through', () => {
    const onUpdate = renderGrid();

    const input = screen.getByLabelText('Sodium (mg)') as HTMLInputElement;
    expect(input.value).toBe('400');

    fireEvent.change(input, { target: { value: '250' } });
    expect(onUpdate).toHaveBeenCalledWith(0, 'sodium', 250);
  });

  it('switching to salt shows the stored sodium as grams of salt', () => {
    renderGrid();

    fireEvent.click(screen.getByTestId('select-unit-salt_g'));

    const input = screen.getByLabelText('Salt (g)') as HTMLInputElement;
    expect(input.value).toBe('1');
  });

  it('a salt entry is stored as sodium at 400 mg per gram', () => {
    const onUpdate = renderGrid();

    fireEvent.click(screen.getByTestId('select-unit-salt_g'));
    fireEvent.change(screen.getByLabelText('Salt (g)'), {
      target: { value: '0.9' },
    });

    expect(onUpdate).toHaveBeenCalledWith(0, 'sodium', 360);
  });

  it('focusing and leaving an untouched salt field does not change sodium', () => {
    const onUpdate = jest.fn();
    render(
      <NutrientGrid
        variantIndex={0}
        variant={{ ...variant, sodium: 123 } as unknown as FormFoodVariant}
        visibleNutrients={['sodium']}
        energyUnit="kcal"
        convertEnergy={(value) => value}
        onUpdate={onUpdate}
      />
    );

    fireEvent.click(screen.getByTestId('select-unit-salt_g'));
    const input = screen.getByLabelText('Salt (g)') as HTMLInputElement;
    expect(input.value).toBe('0.31');

    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('clearing the salt field clears sodium', () => {
    const onUpdate = renderGrid();

    fireEvent.click(screen.getByTestId('select-unit-salt_g'));
    fireEvent.change(screen.getByLabelText('Salt (g)'), {
      target: { value: '' },
    });

    expect(onUpdate).toHaveBeenCalledWith(0, 'sodium', undefined);
  });

  it('switching back to mg keeps the field on sodium', () => {
    const onUpdate = renderGrid();

    fireEvent.click(screen.getByTestId('select-unit-salt_g'));
    fireEvent.click(screen.getByTestId('select-unit-sodium_mg'));

    const input = screen.getByLabelText('Sodium (mg)') as HTMLInputElement;
    expect(input.value).toBe('400');
    fireEvent.change(input, { target: { value: '120' } });
    expect(onUpdate).toHaveBeenCalledWith(0, 'sodium', 120);
  });
});
