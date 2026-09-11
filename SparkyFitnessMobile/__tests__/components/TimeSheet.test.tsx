import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import TimeSheet, { type TimeSheetRef } from '../../src/components/TimeSheet';
import { usePreferences } from '../../src/hooks/usePreferences';

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return <View testID="bottom-sheet-modal">{props.children}</View>;
    }),
    BottomSheetView: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('../../src/hooks/usePreferences');

function pickerProps(queries: { getByTestId: (id: string) => any }) {
  return queries.getByTestId('date-picker').props;
}

describe('TimeSheet', () => {
  const mockedUsePreferences = usePreferences as jest.MockedFunction<
    typeof usePreferences
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses 24-hour presentation (use12Hours=false) when preferences set time_format to HH:mm', () => {
    mockedUsePreferences.mockReturnValue({
      preferences: { time_format: 'HH:mm' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const queries = render(
      <TimeSheet value="13:30" onSelectTime={jest.fn()} />
    );
    const picker = pickerProps(queries);
    expect(picker.use12Hours).toBe(false);
  });

  it('uses 12-hour presentation (use12Hours=true) when preferences set time_format to h:mm A', () => {
    mockedUsePreferences.mockReturnValue({
      preferences: { time_format: 'h:mm A' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const queries = render(
      <TimeSheet value="13:30" onSelectTime={jest.fn()} />
    );
    const picker = pickerProps(queries);
    expect(picker.use12Hours).toBe(true);
  });

  it('explicit timeFormat prop overrides preferences', () => {
    mockedUsePreferences.mockReturnValue({
      preferences: { time_format: 'h:mm A' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const queries = render(
      <TimeSheet value="13:30" onSelectTime={jest.fn()} timeFormat="HH:mm" />
    );
    const picker = pickerProps(queries);
    expect(picker.use12Hours).toBe(false);
  });

  it('calls onSelectTime when time changes and Done is clicked', () => {
    mockedUsePreferences.mockReturnValue({
      preferences: { time_format: 'HH:mm' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const onSelectTime = jest.fn();
    const ref = React.createRef<TimeSheetRef>();
    const queries = render(
      <TimeSheet ref={ref} value="13:30" onSelectTime={onSelectTime} />
    );

    act(() => {
      ref.current?.present();
    });

    act(() => {
      pickerProps(queries).onChange({
        date: new Date(2026, 0, 1, 14, 45, 0),
      });
    });

    expect(onSelectTime).toHaveBeenCalledWith('14:45');

    const doneButton = queries.getByText('Done');
    fireEvent.press(doneButton);

    expect(onSelectTime).toHaveBeenLastCalledWith('14:45');
  });
});
