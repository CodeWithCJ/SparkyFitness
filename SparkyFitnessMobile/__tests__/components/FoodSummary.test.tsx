import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FoodSummary from '../../src/components/FoodSummary';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { MealType } from '../../src/types/mealTypes';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: ({ name }: { name: string }) => <View testID={`icon-${name}`} /> };
});

jest.mock('../../src/components/SwipeableFoodRow', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="food-row" /> };
});

const mealTypes: MealType[] = [
  { id: 'sys-b', name: 'breakfast', sort_order: 0, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
  { id: 'sys-l', name: 'lunch', sort_order: 1, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
  { id: 'custom-pw', name: 'Pre-Workout', sort_order: 0, user_id: 'user1', created_at: '', is_visible: true, show_in_quick_log: true },
  { id: 'custom-ps', name: 'Post-Workout', sort_order: 5, user_id: 'user1', created_at: '', is_visible: true, show_in_quick_log: true },
  // A CUSTOM category deliberately named like the system type.
  { id: 'custom-b', name: 'breakfast', sort_order: 0, user_id: 'user1', created_at: '', is_visible: true, show_in_quick_log: true },
];

function setTestLocale(locale: 'en' | 'pl'): void {
  (
    globalThis as typeof globalThis & {
      __setTestLocale: (value: 'en' | 'pl') => void;
    }
  ).__setTestLocale(locale);
}

const entry = (id: string, meal_type_id: string, meal_type: string): FoodEntry =>
  ({ id, meal_type_id, meal_type } as FoodEntry);

describe('FoodSummary', () => {
  it('renders custom meal types as their own sections (not merged into Other)', () => {
    const view = render(
      <FoodSummary
        foodEntries={[
          entry('1', 'custom-pw', 'Pre-Workout'),
          entry('2', 'custom-ps', 'Post-Workout'),
        ]}
        mealTypes={mealTypes}
      />,
    );

    expect(view.getByText('Pre-Workout')).toBeTruthy();
    expect(view.getByText('Post-Workout')).toBeTruthy();
    expect(view.queryByText('Other')).toBeNull();
  });

  it('orders sections by sort_order and localizes system labels', () => {
    const view = render(
      <FoodSummary
        foodEntries={[
          entry('1', 'sys-l', 'lunch'),
          entry('2', 'sys-b', 'breakfast'),
          entry('3', 'custom-ps', 'Post-Workout'),
        ]}
        mealTypes={mealTypes}
      />,
    );

    // breakfast (0), Pre-Workout (0), lunch (1), Post-Workout (5) — but only
    // sections with entries render; stable sort keeps breakfast before lunch.
    const texts = view.getAllByText(/Breakfast|Lunch|Post-Workout/).map((n) => n.props.children);
    expect(texts).toEqual(['Breakfast', 'Lunch', 'Post-Workout']);
  });

  it('keeps hidden/deleted type entries visible in their own literal group', () => {
    const view = render(
      <FoodSummary
        foodEntries={[entry('1', 'gone-id', 'Deleted Meal')]}
        mealTypes={mealTypes}
      />,
    );

    expect(view.getByText('Deleted Meal')).toBeTruthy();
    expect(view.queryByText('Other')).toBeNull();
  });

  it('passes the canonical meal type id and name when a section is pressed', () => {
    const onPressMealType = jest.fn();
    const view = render(
      <FoodSummary
        foodEntries={[entry('1', 'custom-pw', 'Pre-Workout')]}
        mealTypes={mealTypes}
        onPressMealType={onPressMealType}
      />,
    );

    fireEvent.press(view.getByText('Pre-Workout'));
    expect(onPressMealType).toHaveBeenCalledWith('custom-pw', 'Pre-Workout', expect.any(Array));
  });

  it('renders a custom category named breakfast literally in Polish (not Śniadanie)', () => {
    setTestLocale('pl');
    const view = render(
      <FoodSummary
        foodEntries={[entry('1', 'custom-b', 'breakfast')]}
        mealTypes={mealTypes}
      />,
    );

    expect(view.getByText('breakfast')).toBeTruthy();
    expect(view.queryByText('Śniadanie')).toBeNull();
    setTestLocale('en');
  });

  it('uses the neutral icon for a custom category named breakfast', () => {
    const view = render(
      <FoodSummary
        foodEntries={[entry('1', 'custom-b', 'breakfast')]}
        mealTypes={mealTypes}
      />,
    );

    // The custom group renders the neutral snack icon, not the system
    // breakfast icon.
    expect(view.queryByTestId('icon-meal-breakfast')).toBeNull();
    expect(view.getByTestId('icon-meal-snack')).toBeTruthy();
  });
});
