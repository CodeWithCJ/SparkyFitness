import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import {
  createQueryWrapper,
  createTestQueryClient,
} from '../hooks/queryTestUtils';
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
      />
    );

    fireEvent.press(screen.getByText(/120 kcal/));

    expect(onAdjustServing).toHaveBeenCalledWith(entry);
  });

  it('opens the food entry view from the row body for standalone entries', () => {
    const entry = createEntry();

    const screen = renderRow(
      <SwipeableFoodRow
        entry={entry}
        nutrition={{ calories: 120, protein: 15, carbs: 8, fat: 2 }}
        onAdjustServing={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText(/Greek Yogurt/));

    expect(mockNavigate).toHaveBeenCalledWith('FoodEntryView', { entry });
  });

  it('routes meal-component tap to EditLoggedMeal', () => {
    const entry = createEntry({ food_entry_meal_id: 'fem-1' });

    const screen = renderRow(
      <SwipeableFoodRow
        entry={entry}
        nutrition={{ calories: 120, protein: 15, carbs: 8, fat: 2 }}
        onAdjustServing={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText(/Greek Yogurt/));

    expect(mockNavigate).toHaveBeenCalledWith('EditLoggedMeal', {
      foodEntryMealId: 'fem-1',
    });
  });

  it('does not surface the quick-adjust affordance for meal components', () => {
    const entry = createEntry({ food_entry_meal_id: 'fem-1' });
    const onAdjustServing = jest.fn();

    const screen = renderRow(
      <SwipeableFoodRow
        entry={entry}
        nutrition={{ calories: 120, protein: 15, carbs: 8, fat: 2 }}
        onAdjustServing={onAdjustServing}
      />
    );

    // Just text — no button.
    fireEvent.press(screen.getByText(/120 kcal/));
    expect(onAdjustServing).not.toHaveBeenCalled();
  });

  it('omits "Adjust serving" from the long-press menu for meal components', () => {
    const entry = createEntry({ food_entry_meal_id: 'fem-1' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const screen = renderRow(
      <SwipeableFoodRow
        entry={entry}
        nutrition={{ calories: 120, protein: 15, carbs: 8, fat: 2 }}
        onAdjustServing={jest.fn()}
      />
    );

    fireEvent(screen.getByText(/Greek Yogurt/), 'longPress');

    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as { text: string }[];
    const labels = buttons.map((b) => b.text);
    expect(labels).not.toContain('Adjust serving');
    expect(labels).toEqual(expect.arrayContaining(['Delete', 'Cancel']));

    alertSpy.mockRestore();
  });

  describe('read only (the Diary read from the phone while offline)', () => {
    const nutrition = { calories: 120, protein: 15, carbs: 8, fat: 2 };

    it('still opens the entry from the phone, so it can be edited offline', () => {
      const screen = renderRow(
        <SwipeableFoodRow
          entry={createEntry()}
          nutrition={nutrition}
          onAdjustServing={jest.fn()}
          readOnly
        />
      );

      fireEvent.press(screen.getByText('Greek Yogurt'));

      expect(mockNavigate).toHaveBeenCalledWith('FoodEntryView', {
        entry: expect.objectContaining({ id: 'entry-1' }),
      });
    });

    it('opens the amount sheet for an entry waiting to upload, and the menu offers adjust and delete', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
      const onAdjustServing = jest.fn();
      const screen = renderRow(
        <SwipeableFoodRow
          entry={createEntry({ id: 'pending-abc' })}
          nutrition={nutrition}
          onAdjustServing={onAdjustServing}
          readOnly
        />
      );

      fireEvent.press(screen.getByText('Greek Yogurt'));
      expect(onAdjustServing).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();

      fireEvent(screen.getByText('Greek Yogurt'), 'longPress');
      const buttons = alertSpy.mock.calls[0][2] as { text: string }[];
      expect(buttons.map((button) => button.text)).toEqual([
        'Adjust serving',
        'Delete',
        'Cancel',
      ]);
    });

    it('deletes a component of a logged meal through the meal, which is kept on the phone', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
      const screen = renderRow(
        <SwipeableFoodRow
          entry={createEntry({ food_entry_meal_id: 'fem-1' })}
          nutrition={nutrition}
          readOnly
        />
      );

      fireEvent(screen.getByText('Greek Yogurt'), 'longPress');

      const buttons = alertSpy.mock.calls[0][2] as { text: string }[];
      expect(buttons.map((button) => button.text)).toEqual([
        'Delete',
        'Cancel',
      ]);
    });

    it('treats an entry waiting to upload the same way, even with the server up', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
      const onAdjustServing = jest.fn();
      const screen = renderRow(
        <SwipeableFoodRow
          entry={createEntry({ id: 'pending-abc' })}
          nutrition={nutrition}
          onAdjustServing={onAdjustServing}
        />
      );

      fireEvent.press(screen.getByText('Greek Yogurt'));
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(onAdjustServing).toHaveBeenCalledTimes(1);

      fireEvent(screen.getByText('Greek Yogurt'), 'longPress');
      const buttons = alertSpy.mock.calls[0][2] as { text: string }[];
      expect(buttons.map((button) => button.text)).toEqual([
        'Adjust serving',
        'Delete',
        'Cancel',
      ]);
    });
  });
});
