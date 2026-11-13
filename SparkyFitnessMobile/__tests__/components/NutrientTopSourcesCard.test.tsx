import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import NutrientTopSourcesCard from '../../src/components/NutrientTopSourcesCard';
import type { FoodEntry } from '../../src/types/foodEntries';

const entry = (overrides: Partial<FoodEntry>): FoodEntry => ({
  id: 'e',
  meal_type: 'Breakfast',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-10-01',
  serving_size: 1,
  calories: 100,
  ...overrides,
});

const entries = [
  entry({ id: '1', food_id: 'milk', food_name: 'Milk', calcium: 300 }),
  entry({
    id: '2',
    food_id: 'tofu',
    food_name: 'Tofu',
    calcium: 200,
    meal_type: 'Dinner',
    entry_date: '2026-10-02',
  }),
];

const renderCard = (
  props: Partial<React.ComponentProps<typeof NutrientTopSourcesCard>> = {}
) =>
  render(
    <NutrientTopSourcesCard
      entries={entries}
      isLoading={false}
      isError={false}
      nutrientKey="calcium"
      nutrientLabel="Calcium"
      unit="mg"
      selectedDay={null}
      selectedDayLabel=""
      onClearDay={jest.fn()}
      onViewEntry={jest.fn()}
      {...props}
    />
  );

describe('NutrientTopSourcesCard', () => {
  it('lists the largest sources first', () => {
    const { getByTestId } = renderCard();
    expect(getByTestId('top-source-0')).toHaveTextContent(/Milk/);
    expect(getByTestId('top-source-1')).toHaveTextContent(/Tofu/);
  });

  it('narrows to one meal type', () => {
    const { getByTestId, queryByText } = renderCard();
    fireEvent.press(getByTestId('top-sources-meal-Dinner'));
    expect(queryByText('Milk')).toBeNull();
    expect(getByTestId('top-source-0')).toHaveTextContent(/Tofu/);
  });

  it('narrows to the selected day and can clear it', () => {
    const onClearDay = jest.fn();
    const { getByTestId, queryByText } = renderCard({
      selectedDay: '2026-10-02',
      selectedDayLabel: 'Fri, Oct 2',
      onClearDay,
    });
    expect(queryByText('Milk')).toBeNull();
    fireEvent.press(getByTestId('top-sources-clear-day'));
    expect(onClearDay).toHaveBeenCalled();
  });

  it('shows an empty state when nothing matches', () => {
    const { getByText } = renderCard({ nutrientKey: 'iron' });
    expect(getByText('No Calcium logged for this selection')).toBeTruthy();
  });

  it('expands a source to its entries and opens one', () => {
    const onViewEntry = jest.fn();
    const { getByTestId, queryByTestId } = renderCard({ onViewEntry });
    expect(queryByTestId('top-source-entry-1')).toBeNull();
    fireEvent.press(getByTestId('top-source-toggle-0'));
    fireEvent.press(getByTestId('top-source-entry-1'));
    expect(onViewEntry).toHaveBeenCalledWith(entries[0]);
    fireEvent.press(getByTestId('top-source-toggle-0'));
    expect(queryByTestId('top-source-entry-1')).toBeNull();
  });
});
