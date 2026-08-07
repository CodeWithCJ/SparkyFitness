import React, { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import CopyMealSheet, { type CopyMealSheetRef } from '../../src/components/CopyMealSheet';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';

jest.mock('../../src/hooks/useMealTypes', () => ({
  useMealTypes: jest.fn(() => ({
    mealTypes: [
      { id: 'breakfast-id', name: 'Breakfast', user_id: null },
      { id: 'brunch-id', name: 'Brunch', user_id: 'user1' },
    ],
  })),
}));

describe('CopyMealSheet', () => {
  it('renders the meal copy controls with English labels', () => {
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={jest.fn()} />);
    act(() => ref.current?.present(getTodayDate(), 'breakfast-id', 'Breakfast'));
    expect(view.getByText('Copy meal: Breakfast')).toBeTruthy();
    expect(view.getByText(/^Source date:/)).toBeTruthy();
    expect(view.getByText('Target date')).toBeTruthy();
    expect(view.getByText('Target meal')).toBeTruthy();
    expect(view.getByText('Brunch')).toBeTruthy();
    expect(view.getByText('Copy')).toBeTruthy();
  });

  it('keeps custom meal types literal and preserves the copy payload and disabled same slot', () => {
    const onCopy = jest.fn();
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={onCopy} />);
    const sourceDate = addDays(getTodayDate(), -2);
    act(() => ref.current?.present(sourceDate, 'brunch-id', 'Brunch'));
    expect(view.getByText('Copy meal: Brunch')).toBeTruthy();
    const copyButton = view.getByLabelText('Copy');
    fireEvent.press(copyButton);
    expect(onCopy).not.toHaveBeenCalled();
    fireEvent.press(view.getByText('Breakfast'));
    fireEvent.press(view.getByLabelText('Copy'));
    expect(onCopy).toHaveBeenCalledWith({
      sourceDate,
      sourceMealType: 'Brunch',
      targetDate: sourceDate,
      targetMealType: 'Breakfast',
    });
  });

  it('renders the pending label while copying', () => {
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} isPending onCopy={jest.fn()} />);
    act(() => ref.current?.present(getTodayDate(), 'breakfast-id', 'Breakfast'));
    expect(view.getByText('Copying...')).toBeTruthy();
  });
});
