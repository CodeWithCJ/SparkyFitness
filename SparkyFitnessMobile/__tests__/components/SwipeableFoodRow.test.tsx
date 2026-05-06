import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { createQueryWrapper, createTestQueryClient } from '../hooks/queryTestUtils';
import SwipeableFoodRow from '../../src/components/SwipeableFoodRow';
import type { FoodEntry } from '../../src/types/foodEntries';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const createEntry = (overrides: Partial<FoodEntry> = {}): FoodEntry => ({
  id: 'entry-1',
  food_id: 'food-1',
  user_id: 'user-1',
  meal_type: 'breakfast',
  quantity: 100,
  unit: 'g',
  variant_id: 'variant-1',
  food_name: 'Greek Yogurt',
  brand_name: 'Sparky',
  entry_date: '2026-05-06',
  serving_size: 100,
  serving_unit: 'g',
  calories: 120,
  protein: 15,
  carbs: 8,
  fat: 2,
  ...overrides,
});

describe('SwipeableFoodRow', () => {
  const renderRow = (ui: React.ReactElement) =>
    render(ui, { wrapper: createQueryWrapper(createTestQueryClient()) });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens serving adjustment from the calorie affordance', () => {
    const entry = createEntry();
    const onAdjustServing = jest.fn();

    const screen = renderRow(
      <SwipeableFoodRow
        entry={entry}
        nutrition={{ calories: 120, protein: 15, carbs: 8, fat: 2 }}
        onAdjustServing={onAdjustServing}
      />,
    );

    fireEvent.press(screen.getByText(/120 Cal/));

    expect(onAdjustServing).toHaveBeenCalledWith(entry);
  });

  it('keeps serving adjustment available for logged meal components', () => {
    const entry = createEntry({ food_entry_meal_id: 'meal-entry-1' });
    const onAdjustServing = jest.fn();

    const screen = renderRow(
      <SwipeableFoodRow
        entry={entry}
        nutrition={{ calories: 120, protein: 15, carbs: 8, fat: 2 }}
        onAdjustServing={onAdjustServing}
      />,
    );

    fireEvent.press(screen.getByText(/120 Cal/));

    expect(onAdjustServing).toHaveBeenCalledWith(entry);
  });

  it('opens the food entry view from the row body', () => {
    const entry = createEntry();

    const screen = renderRow(
      <SwipeableFoodRow
        entry={entry}
        nutrition={{ calories: 120, protein: 15, carbs: 8, fat: 2 }}
        onAdjustServing={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText(/Greek Yogurt/));

    expect(mockNavigate).toHaveBeenCalledWith('FoodEntryView', { entry });
  });
});
