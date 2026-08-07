import React, { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import CopyMealSheet, { type CopyMealSheetRef } from '../../src/components/CopyMealSheet';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';

jest.mock('../../src/hooks/useMealTypes', () => ({
  useMealTypes: jest.fn(),
}));

const defaultMealTypes = [
  { id: 'breakfast-id', name: 'Breakfast', user_id: null },
  { id: 'brunch-id', name: 'Brunch', user_id: 'user1' },
];

const ambiguousMealTypes = [
  { id: 'breakfast-id', name: 'Breakfast', user_id: null },
  { id: 'breakfast-custom', name: 'Breakfast', user_id: 'user2' },
  { id: 'brunch-id', name: 'Brunch', user_id: 'user1' },
];

describe('CopyMealSheet', () => {
  const useMealTypesMock = require('../../src/hooks/useMealTypes').useMealTypes as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    useMealTypesMock.mockReturnValue({ mealTypes: defaultMealTypes });
  });

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
    // Two chips share the name "Breakfast" (system + custom); pick the first.
    fireEvent.press(view.getAllByText('Breakfast')[0]);
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

  it('blocks a copy when the source name is ambiguous (duplicate names)', () => {
    useMealTypesMock.mockReturnValue({ mealTypes: ambiguousMealTypes });
    const onCopy = jest.fn();
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={onCopy} />);
    const sourceDate = getTodayDate();
    act(() => ref.current?.present(sourceDate, 'breakfast-custom', 'Breakfast'));

    // Target Brunch is unambiguous but the SOURCE name "Breakfast" maps to two
    // distinct ids — the copy must be blocked, never silently ambiguous.
    fireEvent.press(view.getByText('Brunch'));
    fireEvent.press(view.getByLabelText('Copy'));

    expect(onCopy).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    );
  });

  it('blocks a copy when the target name is ambiguous (duplicate names)', () => {
    useMealTypesMock.mockReturnValue({ mealTypes: ambiguousMealTypes });
    const onCopy = jest.fn();
    const ref = createRef<CopyMealSheetRef>();
    const view = render(<CopyMealSheet ref={ref} onCopy={onCopy} />);
    const sourceDate = getTodayDate();
    act(() => ref.current?.present(sourceDate, 'brunch-id', 'Brunch'));

    // Source Brunch is unambiguous but the selected target "Breakfast" maps to
    // two distinct ids — blocked with a clear error instead of a wrong copy.
    // Two chips share the name "Breakfast" (system + custom); pick the first.
    fireEvent.press(view.getAllByText('Breakfast')[0]);
    fireEvent.press(view.getByLabelText('Copy'));

    expect(onCopy).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    );
  });
});
