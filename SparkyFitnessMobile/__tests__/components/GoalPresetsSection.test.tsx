import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import GoalPresetsSection from '../../src/components/GoalPresetsSection';
import type { GoalPreset } from '../../src/types/goals';

const preset = {
  id: 'p1',
  preset_name: 'Training day',
  calories: 2400,
  protein: 180,
  carbs: 250,
  fat: 70,
} as GoalPreset;

describe('GoalPresetsSection', () => {
  const setup = () => {
    const handlers = {
      onApply: jest.fn(),
      onCreate: jest.fn(),
      onEdit: jest.fn(),
      onDelete: jest.fn().mockResolvedValue(undefined),
    };
    const utils = render(
      <GoalPresetsSection presets={[preset]} isBusy={false} {...handlers} />
    );
    return { ...utils, handlers };
  };

  it('summarises the preset and applies it to the form', () => {
    const { getByText, getByTestId, handlers } = setup();
    expect(getByText('Training day')).toBeTruthy();
    expect(getByText('2400 kcal, 180g P, 250g C, 70g F')).toBeTruthy();
    fireEvent.press(getByTestId('goal-preset-apply-p1'));
    expect(handlers.onApply).toHaveBeenCalledWith(preset);
  });

  it('opens the editor for an existing preset and for a new one', () => {
    const { getByTestId, handlers } = setup();
    fireEvent.press(getByTestId('goal-preset-edit-p1'));
    expect(handlers.onEdit).toHaveBeenCalledWith(preset);
    fireEvent.press(getByTestId('goal-preset-create'));
    expect(handlers.onCreate).toHaveBeenCalled();
  });
});
