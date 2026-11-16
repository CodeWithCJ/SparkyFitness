import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CookedWeightSection from '../../src/components/CookedWeightSection';

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

const ricePer100g = (raw: number) => (360 * raw) / 100;

describe('CookedWeightSection (#3534)', () => {
  it('reports the raw and cooked quantity of a new batch', () => {
    const onChange = jest.fn();
    render(
      <CookedWeightSection
        unit="g"
        foodName="Rice"
        energyUnit="kcal"
        caloriesFor={ricePer100g}
        onChange={onChange}
      />
    );
    const toggle = screen.getByLabelText('Weighed it cooked');
    expect(toggle.props.value).toBe(false);
    fireEvent(toggle, 'valueChange', true);
    expect(onChange).toHaveBeenLastCalledWith(true, null);
    expect(
      screen.getByText('Enter the weights to calculate the raw amount.')
    ).toBeTruthy();

    fireEvent.changeText(
      screen.getByLabelText('Raw weight of batch (g)'),
      '200'
    );
    fireEvent.changeText(
      screen.getByLabelText('Cooked weight of batch (g)'),
      '500'
    );
    fireEvent.changeText(screen.getByLabelText('You ate (cooked, g)'), '300');

    expect(onChange).toHaveBeenLastCalledWith(true, {
      rawQuantity: 120,
      cookedQuantity: 300,
    });
    expect(screen.getByText('= 120 g raw · 432 kcal')).toBeTruthy();
  });

  it('accepts a decimal comma', () => {
    const onChange = jest.fn();
    render(
      <CookedWeightSection
        unit="kg"
        foodName="Rice"
        energyUnit="kcal"
        caloriesFor={() => null}
        onChange={onChange}
      />
    );
    fireEvent(screen.getByLabelText('Weighed it cooked'), 'valueChange', true);
    fireEvent.changeText(
      screen.getByLabelText('Raw weight of batch (kg)'),
      '0,4'
    );
    fireEvent.changeText(
      screen.getByLabelText('Cooked weight of batch (kg)'),
      '1'
    );
    fireEvent.changeText(screen.getByLabelText('You ate (cooked, kg)'), '0,25');
    expect(onChange).toHaveBeenLastCalledWith(true, {
      rawQuantity: 0.1,
      cookedQuantity: 0.25,
    });
  });

  it('pre-ticks and reuses the yield of the last cooked entry until a new batch', () => {
    const onChange = jest.fn();
    render(
      <CookedWeightSection
        unit="g"
        foodName="Rice"
        energyUnit="kcal"
        previousEntry={{
          id: 'entry-9',
          entry_date: '2026-11-13',
          quantity: 120,
          unit: 'g',
          cooked_quantity: 300,
        }}
        caloriesFor={ricePer100g}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText('Weighed it cooked').props.value).toBe(true);
    expect(screen.getByText(/^Using 2\.5× from your Rice on /)).toBeTruthy();
    expect(screen.queryByLabelText('Raw weight of batch (g)')).toBeNull();
    expect(screen.getByText('Enter the cooked weight you ate.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('You ate (cooked, g)'), '250');
    expect(onChange).toHaveBeenLastCalledWith(true, {
      rawQuantity: 100,
      cookedQuantity: 250,
    });

    fireEvent.press(screen.getByText('New batch'));
    expect(screen.getByLabelText('Raw weight of batch (g)')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(true, null);
  });

  it('reopens an edited entry with its yield and cooked weight', () => {
    const onChange = jest.fn();
    render(
      <CookedWeightSection
        unit="g"
        foodName="Rice"
        energyUnit="kcal"
        editingEntry={{ quantity: 120, cookedQuantity: 300 }}
        caloriesFor={ricePer100g}
        onChange={onChange}
      />
    );
    expect(screen.getByText('Using 2.5× from this entry')).toBeTruthy();
    expect(screen.getByDisplayValue('300')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(true, {
      rawQuantity: 120,
      cookedQuantity: 300,
    });
  });

  it('keeps the stored raw quantity of an untouched kg entry', () => {
    const onChange = jest.fn();
    render(
      <CookedWeightSection
        unit="kg"
        foodName="Rice"
        energyUnit="kcal"
        editingEntry={{ quantity: 0.125, cookedQuantity: 0.3 }}
        caloriesFor={() => null}
        onChange={onChange}
      />
    );
    // 0.3 / 2.4 would round, the stored 0.125 must come back unchanged.
    expect(onChange).toHaveBeenLastCalledWith(true, {
      rawQuantity: 0.125,
      cookedQuantity: 0.3,
    });
  });
});
