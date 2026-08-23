import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import CalendarSheet from '../../src/components/CalendarSheet';

const pickerProps: { month?: number; year?: number; onMonthChange?: (month: number) => void } = {};
let mockAppLocale = 'en';

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return <View>{props.children}</View>;
    }),
    BottomSheetView: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('react-native-ui-datepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => {
      pickerProps.month = props.month;
      pickerProps.year = props.year;
      pickerProps.onMonthChange = props.onMonthChange;
      return <View testID="calendar-picker" />;
    },
  };
});

jest.mock('uniwind', () => ({ useCSSVariable: () => ['#fff', '#888', '#00f', '#000', '#444'] }));
jest.mock('../../src/components/Icon', () => () => null);
jest.mock('../../src/components/ui/sheetChrome', () => ({
  sheetContainer: ({ children }: any) => children,
  useSheetBackdrop: () => undefined,
}));
jest.mock('../../src/utils/calendarLocalization', () => ({
  useCalendarPresentation: () => ({ appLocale: mockAppLocale, presentation: { locale: mockAppLocale, firstDayOfWeek: 0 } }),
  getCalendarWeekdayShortNames: () => [],
  getCalendarMonthNames: () => Array.from({ length: 12 }, (_, index) => `month-${index}`),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('CalendarSheet', () => {
  beforeEach(() => {
    pickerProps.month = undefined;
    pickerProps.year = undefined;
    pickerProps.onMonthChange = undefined;
    mockAppLocale = 'en';
  });

  it('syncs the visible month when selectedDate changes without unmounting', () => {
    const { rerender } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    expect(pickerProps).toMatchObject({ month: 7, year: 2026 });

    act(() => rerender(<CalendarSheet selectedDate="2026-09-02" onSelectDate={jest.fn()} />));
    expect(pickerProps).toMatchObject({ month: 8, year: 2026 });
  });

  it('keeps a manually navigated month during an ordinary rerender', () => {
    const { rerender } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    act(() => pickerProps.onMonthChange?.(8));
    expect(pickerProps).toMatchObject({ month: 8, year: 2026 });

    act(() => rerender(<CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />));
    expect(pickerProps).toMatchObject({ month: 8, year: 2026 });
  });

  it('keeps the manually navigated month when the language changes', () => {
    const { rerender } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    act(() => pickerProps.onMonthChange?.(9));
    mockAppLocale = 'pl';
    act(() => rerender(<CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />));
    expect(pickerProps).toMatchObject({ month: 9, year: 2026 });
  });

  it('syncs across the December to January year boundary', () => {
    const { rerender } = render(
      <CalendarSheet selectedDate="2026-12-31" onSelectDate={jest.fn()} />,
    );
    expect(pickerProps).toMatchObject({ month: 11, year: 2026 });

    act(() => rerender(<CalendarSheet selectedDate="2027-01-01" onSelectDate={jest.fn()} />));
    expect(pickerProps).toMatchObject({ month: 0, year: 2027 });
  });

  it('navigates using the custom month controls', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('cycleCalendar.nextMonth'));
    expect(pickerProps).toMatchObject({ month: 8, year: 2026 });
  });
});
