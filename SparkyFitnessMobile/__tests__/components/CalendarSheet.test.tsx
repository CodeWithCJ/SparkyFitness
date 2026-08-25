import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import CalendarSheet from '../../src/components/CalendarSheet';

const pickerProps: { month?: number; year?: number; onMonthChange?: (month: number) => void; onYearChange?: (year: number) => void; initialView?: string } = {};
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
      pickerProps.onYearChange = props.onYearChange;
      pickerProps.initialView = props.initialView;
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
    pickerProps.onYearChange = undefined;
    pickerProps.initialView = undefined;
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

  it('starts in the day view by default', () => {
    render(<CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    expect(pickerProps.initialView).toBe('day');
  });

  it('opens the month quick-jump grid when the month caption is pressed', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    expect(pickerProps.initialView).toBe('month');
  });

  it('opens the year quick-jump grid when the year caption is pressed', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    fireEvent.press(getByLabelText('cycleCalendar.selectYear'));
    expect(pickerProps.initialView).toBe('year');
  });

  it('returns to the day grid after selecting a month from the quick-jump grid', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    expect(pickerProps.initialView).toBe('month');
    act(() => pickerProps.onMonthChange?.(4));
    expect(pickerProps).toMatchObject({ month: 4, year: 2026, initialView: 'day' });
  });

  it('returns to the day grid after selecting a year from the quick-jump grid', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    fireEvent.press(getByLabelText('cycleCalendar.selectYear'));
    expect(pickerProps.initialView).toBe('year');
    act(() => pickerProps.onYearChange?.(2024));
    expect(pickerProps).toMatchObject({ month: 7, year: 2024, initialView: 'day' });
  });

  it('uses the year-step prev/next labels inside the month and year quick-jump grids', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    // Open month grid — chevrons use year-step labels.
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    fireEvent.press(getByLabelText('cycleCalendar.nextYear'));
    expect(pickerProps).toMatchObject({ month: 7, year: 2027 });
    // After a chevron press, pickerView resets to 'day' so the next chevron
    // steps by one month. Re-open the month grid to test the previous-year step.
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    fireEvent.press(getByLabelText('cycleCalendar.previousYear'));
    expect(pickerProps).toMatchObject({ month: 7, year: 2026 });
  });

  it('keeps the localized month name in the caption after a language switch', () => {
    const { getByText, rerender } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    expect(getByText('month-7')).toBeTruthy();
    mockAppLocale = 'pl';
    act(() => rerender(<CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />));
    expect(getByText('month-7')).toBeTruthy();
  });

  it('preserves firstDayOfWeek from the user preference across language changes', () => {
    const { rerender } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    expect(pickerProps).toMatchObject({ month: 7, year: 2026 });
    mockAppLocale = 'pl';
    act(() => rerender(<CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />));
    // firstDayOfWeek comes from the mocked presentation (0) and must not flip
    // just because the language changed.
    expect(pickerProps).toMatchObject({ month: 7, year: 2026 });
  });

  it('resets pickerView to day after chevron navigation from month grid (no-callback scenario)', () => {
    // Library contract: selecting the CURRENT month does NOT fire onMonthChange,
    // but the library internally returns to day view. The parent must also
    // reset pickerView to 'day' so chevrons step by 1 month (not 12) and
    // accessibility labels say "Previous/Next month" (not year).
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    // Open month grid — chevron label is now 'nextYear'
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    expect(pickerProps.initialView).toBe('month');
    // Simulate "user taps the current month (August = month 7)" — library
    // does NOT call onMonthChange because value === currentMonth.
    // (No onMonthChange call here — this is the bug scenario.)
    // Press the next chevron (year-step in month grid) — it steps by 12 months
    // AND resets pickerView to 'day'.
    fireEvent.press(getByLabelText('cycleCalendar.nextYear'));
    expect(pickerProps).toMatchObject({ month: 7, year: 2027, initialView: 'day' });
    // Now the chevron label should be 'nextMonth' (day grid), and pressing it
    // steps by exactly 1 month, proving pickerView is 'day'.
    fireEvent.press(getByLabelText('cycleCalendar.nextMonth'));
    expect(pickerProps).toMatchObject({ month: 8, year: 2027, initialView: 'day' });
  });

  it('resets pickerView to day after chevron navigation from year grid (no-callback scenario)', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    // Open year grid — chevron label is 'nextYear'
    fireEvent.press(getByLabelText('cycleCalendar.selectYear'));
    expect(pickerProps.initialView).toBe('year');
    // Simulate "user taps the current year (2026)" — library does NOT call
    // onYearChange because value === currentYear. No callback fired.
    // Press next chevron (year-step) — steps by 12 months AND resets to 'day'.
    fireEvent.press(getByLabelText('cycleCalendar.nextYear'));
    expect(pickerProps).toMatchObject({ month: 7, year: 2027, initialView: 'day' });
    // Now in day grid — next chevron steps by 1 month.
    fireEvent.press(getByLabelText('cycleCalendar.nextMonth'));
    expect(pickerProps).toMatchObject({ month: 8, year: 2027, initialView: 'day' });
  });

  it('keeps month navigation stepping at 1 month after same-month selection + chevron', () => {
    // After the no-callback scenario, subsequent chevron presses step by 1
    // month (not 12), proving pickerView is stable at 'day'.
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    // No onMonthChange call (same month scenario). Press year-step chevron
    // which resets pickerView to 'day'.
    fireEvent.press(getByLabelText('cycleCalendar.nextYear'));
    expect(pickerProps).toMatchObject({ month: 7, year: 2027 });
    // Now in day grid — two month-step presses, each +1 month.
    fireEvent.press(getByLabelText('cycleCalendar.nextMonth'));
    expect(pickerProps).toMatchObject({ month: 8, year: 2027 });
    fireEvent.press(getByLabelText('cycleCalendar.nextMonth'));
    expect(pickerProps).toMatchObject({ month: 9, year: 2027 });
  });

  it('does not re-open month grid after same-month no-callback selection + chevron', () => {
    // The key must NOT carry pickerView, so the library does not remount
    // with initialView='month' after the library already returned to day.
    const { getByLabelText, rerender } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    expect(pickerProps.initialView).toBe('month');
    // Same-month selection — no callback. Press chevron (resets to day).
    fireEvent.press(getByLabelText('cycleCalendar.nextYear'));
    expect(pickerProps.initialView).toBe('day');
    // Rerender — picker should stay in day view, not re-open month grid.
    act(() => rerender(<CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />));
    expect(pickerProps.initialView).toBe('day');
  });

});
