import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MealDistributionEditor from '../../src/components/MealDistributionEditor';

const meals = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];

describe('MealDistributionEditor', () => {
  it('shows each meal in kcal and flags totals that are not 100', () => {
    const { getByText, getByTestId } = render(
      <MealDistributionEditor
        meals={meals}
        values={{ breakfast: 50, lunch: 25, dinner: 0 }}
        onChange={jest.fn()}
        totalCalories={2000}
      />
    );
    expect(getByText('Breakfast (1000 kcal)')).toBeTruthy();
    expect(getByTestId('meal-total').props.children).toContain('must be 100');
  });

  it('distributes the remainder evenly across unlocked meals', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <MealDistributionEditor
        meals={meals}
        values={{ breakfast: 50, lunch: 0, dinner: 0 }}
        onChange={onChange}
        totalCalories={2000}
      />
    );
    fireEvent.press(getByTestId('meal-lock-breakfast'));
    fireEvent.press(getByTestId('meal-distribute-remaining'));
    expect(onChange).toHaveBeenCalledWith({
      breakfast: 50,
      lunch: 25,
      dinner: 25,
    });
  });

  it('edits a meal from its number input', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <MealDistributionEditor
        meals={meals}
        values={{ breakfast: 50, lunch: 0, dinner: 0 }}
        onChange={onChange}
        totalCalories={2000}
      />
    );
    fireEvent.changeText(getByTestId('goal-input-meal-lunch'), '40');
    expect(onChange).toHaveBeenCalledWith({
      breakfast: 50,
      lunch: 40,
      dinner: 0,
    });
  });
});
