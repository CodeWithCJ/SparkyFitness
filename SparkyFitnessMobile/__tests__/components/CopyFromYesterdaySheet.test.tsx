import React, { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import CopyFromYesterdaySheet, {
  type CopyFromYesterdaySheetRef,
} from '../../src/components/CopyFromYesterdaySheet';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useMealTypes', () => ({
  useMealTypes: jest.fn(),
}));
jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: jest.fn(),
}));

const useMealTypesMock = require('../../src/hooks/useMealTypes')
  .useMealTypes as jest.Mock;
const useDailySummaryMock = require('../../src/hooks/useDailySummary')
  .useDailySummary as jest.Mock;

const mealTypes = [
  { id: 'breakfast-id', name: 'Breakfast', user_id: null },
  { id: 'lunch-id', name: 'Lunch', user_id: null },
];

describe('CopyFromYesterdaySheet', () => {
  beforeEach(async () => {
    await initializeI18n('en');
    jest.clearAllMocks();
    useMealTypesMock.mockReturnValue({
      mealTypes,
      defaultMealTypeId: 'breakfast-id',
    });
    // Source day has entries for Breakfast and Lunch; Dinner is absent.
    useDailySummaryMock.mockReturnValue({
      summary: {
        foodEntries: [{ meal_type: 'Breakfast' }, { meal_type: 'Lunch' }],
      },
      isLoading: false,
    });
  });

  it('renders the meal list with the default meal pre-checked', () => {
    const ref = createRef<CopyFromYesterdaySheetRef>();
    const view = render(
      <CopyFromYesterdaySheet ref={ref} onCopy={jest.fn()} />
    );
    act(() => ref.current?.present('2026-11-20'));

    expect(view.getByText('Copy from yesterday')).toBeTruthy();
    expect(view.getByText('Breakfast')).toBeTruthy();
    expect(view.getByText('Lunch')).toBeTruthy();
    // The default meal (Breakfast) starts checked.
    expect(
      view.getByTestId('copy-yesterday-meal-breakfast-id').props
        .accessibilityState
    ).toEqual({
      checked: true,
      disabled: false,
    });
    expect(
      view.getByTestId('copy-yesterday-meal-lunch-id').props.accessibilityState
    ).toEqual({
      checked: false,
      disabled: false,
    });
  });

  it('copies the selected meals by id into the target date', () => {
    const onCopy = jest.fn();
    const ref = createRef<CopyFromYesterdaySheetRef>();
    const view = render(<CopyFromYesterdaySheet ref={ref} onCopy={onCopy} />);
    act(() => ref.current?.present('2026-11-20'));

    // Check Lunch in addition to the pre-checked Breakfast.
    fireEvent.press(view.getByTestId('copy-yesterday-meal-lunch-id'));
    fireEvent.press(view.getByLabelText('Copy Selected'));

    expect(onCopy).toHaveBeenCalledWith({
      kind: 'selected',
      mealIds: ['breakfast-id', 'lunch-id'],
      targetDate: '2026-11-20',
    });
  });

  it('copies the whole day with a single request', () => {
    const onCopy = jest.fn();
    const ref = createRef<CopyFromYesterdaySheetRef>();
    const view = render(<CopyFromYesterdaySheet ref={ref} onCopy={onCopy} />);
    act(() => ref.current?.present('2026-11-20'));

    fireEvent.press(view.getByLabelText('Copy All'));

    expect(onCopy).toHaveBeenCalledWith({
      kind: 'all',
      targetDate: '2026-11-20',
    });
  });

  it('shows the empty-source message and blocks both copy actions when the source is empty', () => {
    useDailySummaryMock.mockReturnValue({
      summary: { foodEntries: [] },
      isLoading: false,
    });
    const onCopy = jest.fn();
    const ref = createRef<CopyFromYesterdaySheetRef>();
    const view = render(<CopyFromYesterdaySheet ref={ref} onCopy={onCopy} />);
    act(() => ref.current?.present('2026-11-20'));

    // With no source entries the meal list is replaced by a message.
    expect(
      view.getByText('There is nothing to copy from yesterday.')
    ).toBeTruthy();
    expect(view.queryByTestId('copy-yesterday-meal-breakfast-id')).toBeNull();

    // Both copy actions are disabled: nothing selected, nothing to copy all.
    fireEvent.press(view.getByLabelText('Copy Selected'));
    expect(onCopy).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText('Copy All'));
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('disables a single meal with no source entries while keeping the rest selectable', () => {
    useDailySummaryMock.mockReturnValue({
      summary: { foodEntries: [{ meal_type: 'Breakfast' }] },
      isLoading: false,
    });
    const onCopy = jest.fn();
    const ref = createRef<CopyFromYesterdaySheetRef>();
    const view = render(<CopyFromYesterdaySheet ref={ref} onCopy={onCopy} />);
    act(() => ref.current?.present('2026-11-20'));

    // Breakfast has source entries (and is the pre-checked default); Lunch does not.
    expect(
      view.getByTestId('copy-yesterday-meal-breakfast-id').props
        .accessibilityState
    ).toEqual({
      checked: true,
      disabled: false,
    });
    expect(
      view.getByTestId('copy-yesterday-meal-lunch-id').props.accessibilityState
    ).toEqual({
      checked: false,
      disabled: true,
    });
    // Pressing the disabled lunch does nothing; Copy Selected carries only Breakfast.
    fireEvent.press(view.getByTestId('copy-yesterday-meal-lunch-id'));
    fireEvent.press(view.getByLabelText('Copy Selected'));
    expect(onCopy).toHaveBeenCalledWith({
      kind: 'selected',
      mealIds: ['breakfast-id'],
      targetDate: '2026-11-20',
    });
  });

  it('renders the pending label while copying', () => {
    const ref = createRef<CopyFromYesterdaySheetRef>();
    const view = render(
      <CopyFromYesterdaySheet ref={ref} isPending onCopy={jest.fn()} />
    );
    act(() => ref.current?.present('2026-11-20'));

    expect(view.getByText('Copying...')).toBeTruthy();
  });

  it('disables Copy Selected while the source summary is loading', () => {
    useDailySummaryMock.mockReturnValue({
      summary: undefined,
      isLoading: true,
    });
    const onCopy = jest.fn();
    const ref = createRef<CopyFromYesterdaySheetRef>();
    const view = render(<CopyFromYesterdaySheet ref={ref} onCopy={onCopy} />);
    act(() => ref.current?.present('2026-11-20'));

    // The pre-checked meal keeps checkedIds nonempty, but the button is disabled
    // until availability is known, so pressing it copies nothing.
    fireEvent.press(view.getByLabelText('Copy Selected'));
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('shows an error and retry when the source summary fails to load', () => {
    const refetch = jest.fn();
    useDailySummaryMock.mockReturnValue({
      summary: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    const ref = createRef<CopyFromYesterdaySheetRef>();
    const view = render(
      <CopyFromYesterdaySheet ref={ref} onCopy={jest.fn()} />
    );
    act(() => ref.current?.present('2026-11-20'));

    expect(view.getByText('Could not load yesterday’s meals.')).toBeTruthy();
    // The meal list is not shown and Copy All is blocked.
    expect(view.queryByTestId('copy-yesterday-meal-breakfast-id')).toBeNull();
    fireEvent.press(view.getByLabelText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
