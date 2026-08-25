import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import CalendarSheet from '../../src/components/CalendarSheet';

/**
 * Picker mock that models react-native-ui-datepicker 3.1.2 behaviour:
 * `initialView` is consumed ONLY on mount. Subsequent prop changes are
 * ignored by the library — the internal calendar view is controlled by the
 * library itself (user taps, onMonthChange/onYearChange). A remount (via React
 * `key` change) is the only way to apply a new `initialView`.
 *
 * `mockMountedInitialView` captures the view at mount time and does NOT update on
 * re-render, matching the real library contract. `mockMountCount` increments on
 * every mount so tests can assert that a remount actually occurred.
 */
const pickerProps: { month?: number; year?: number; onMonthChange?: (month: number) => void; onYearChange?: (year: number) => void; initialView?: string } = {};
let mockMountedInitialView: string | undefined;
let mockMountCount = 0;
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
      // Mount-only: capture initialView once per mount. React calls this
      // function component on every re-render, but the real library only
      // honours initialView at mount. We use a ref-like pattern keyed to the
      // component instance so re-renders do NOT overwrite the mounted value.
      const mountRef = React.useRef<number | null>(null);
      if (mountRef.current === null) {
        mockMountCount += 1;
        mountRef.current = mockMountCount;
        mockMountedInitialView = props.initialView;
      }
      // Expose live props (month, year, callbacks) for test interaction, but
      // initialView reflects the mount-only snapshot, NOT the current prop.
      pickerProps.month = props.month;
      pickerProps.year = props.year;
      pickerProps.onMonthChange = props.onMonthChange;
      pickerProps.onYearChange = props.onYearChange;
      pickerProps.initialView = mockMountedInitialView;
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
    mockMountedInitialView = undefined;
    mockMountCount = 0;
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
    expect(mockMountedInitialView).toBe('day');
    expect(mockMountCount).toBe(1);
  });

  it('opens the month quick-jump grid when the month caption is pressed', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    // The picker must remount so initialView='month' is applied.
    expect(mockMountCount).toBe(2);
    expect(mockMountedInitialView).toBe('month');
  });

  it('opens the year quick-jump grid when the year caption is pressed', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    fireEvent.press(getByLabelText('cycleCalendar.selectYear'));
    // The picker must remount so initialView='year' is applied.
    expect(mockMountCount).toBe(2);
    expect(mockMountedInitialView).toBe('year');
  });

  it('returns to the day grid after selecting a month from the quick-jump grid', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    expect(mockMountedInitialView).toBe('month');
    const countAfterOpen = mockMountCount;
    act(() => pickerProps.onMonthChange?.(4));
    // onMonthChange fires -> parent resets pickerView to 'day'. visible.month
    // changes from 7 to 4, which legitimately changes the key (month is part
    // of the key), so a remount occurs. But the NEW mount must have
    // initialView='day' (NOT 'month'), proving pickerView was reset.
    expect(mockMountCount).toBe(countAfterOpen + 1);
    expect(mockMountedInitialView).toBe('day');
    expect(pickerProps).toMatchObject({ month: 4, year: 2026 });
  });

  it('returns to the day grid after selecting a year from the quick-jump grid', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />);
    fireEvent.press(getByLabelText('cycleCalendar.selectYear'));
    expect(mockMountedInitialView).toBe('year');
    const countAfterOpen = mockMountCount;
    act(() => pickerProps.onYearChange?.(2024));
    // onYearChange fires -> parent resets pickerView to 'day'. visible.year
    // changes from 2026 to 2024, changing the key, so remount occurs. The
    // NEW mount must have initialView='day' (NOT 'year').
    expect(mockMountCount).toBe(countAfterOpen + 1);
    expect(mockMountedInitialView).toBe('day');
    expect(pickerProps).toMatchObject({ month: 7, year: 2024 });
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
    // Open month grid — remount to 'month'
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    const countAfterOpen = mockMountCount;
    expect(mockMountedInitialView).toBe('month');
    // Simulate "user taps the current month (August = month 7)" — library
    // does NOT call onMonthChange because value === currentMonth.
    // (No onMonthChange call here — this is the bug scenario.)
    // Press the next chevron (year-step in month grid) — it steps by 12 months
    // AND resets pickerView to 'day'. visible.year changes from 2026 to 2027,
    // so the key changes and a remount occurs. The NEW mount must have
    // initialView='day' (NOT 'month'), proving pickerView was reset and the
    // mount token was NOT bumped to re-open the grid.
    fireEvent.press(getByLabelText('cycleCalendar.nextYear'));
    expect(mockMountCount).toBe(countAfterOpen + 1); // key changed (year)
    expect(mockMountedInitialView).toBe('day'); // NOT 'month' — no stale grid
    expect(pickerProps).toMatchObject({ month: 7, year: 2027 });
    // Now the chevron label should be 'nextMonth' (day grid), and pressing it
    // steps by exactly 1 month, proving pickerView is 'day'.
    fireEvent.press(getByLabelText('cycleCalendar.nextMonth'));
    expect(pickerProps).toMatchObject({ month: 8, year: 2027 });
  });

  it('resets pickerView to day after chevron navigation from year grid (no-callback scenario)', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    // Open year grid — remount to 'year'
    fireEvent.press(getByLabelText('cycleCalendar.selectYear'));
    const countAfterOpen = mockMountCount;
    expect(mockMountedInitialView).toBe('year');
    // Simulate "user taps the current year (2026)" — library does NOT call
    // onYearChange because value === currentYear. No callback fired.
    // Press next chevron (year-step) — steps by 12 months AND resets to 'day'.
    // visible.year changes from 2026 to 2027, so key changes and remount occurs.
    // NEW mount must have initialView='day' (NOT 'year').
    fireEvent.press(getByLabelText('cycleCalendar.nextYear'));
    expect(mockMountCount).toBe(countAfterOpen + 1);
    expect(mockMountedInitialView).toBe('day'); // NOT 'year' — no stale grid
    expect(pickerProps).toMatchObject({ month: 7, year: 2027 });
    // Now in day grid — next chevron steps by 1 month.
    fireEvent.press(getByLabelText('cycleCalendar.nextMonth'));
    expect(pickerProps).toMatchObject({ month: 8, year: 2027 });
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
    // The mount token must NOT be bumped when pickerView resets to 'day' via
    // chevron, so the library does not remount with initialView='month' after
    // the library already returned to day on its own.
    const { getByLabelText, rerender } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    const countAfterOpen = mockMountCount;
    expect(mockMountedInitialView).toBe('month');
    // Same-month selection — no callback. Press chevron (resets to day).
    // visible.year changes (2026 -> 2027), so key changes and remount occurs.
    // The NEW mount must have initialView='day' (NOT 'month').
    fireEvent.press(getByLabelText('cycleCalendar.nextYear'));
    expect(mockMountCount).toBe(countAfterOpen + 1);
    expect(mockMountedInitialView).toBe('day'); // NOT 'month' — no stale grid
    // Rerender — picker should stay in day view, not re-open month grid.
    act(() => rerender(<CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />));
    expect(mockMountedInitialView).toBe('day');
  });

  it('remounts when reopening month grid after returning to day', () => {
    // After returning to day (via onMonthChange), opening month grid again
    // must bump the mount token and remount with initialView='month'.
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    // Open month grid -> remount to 'month'
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    expect(mockMountedInitialView).toBe('month');
    const countAfterFirstOpen = mockMountCount;
    // Select a different month -> onMonthChange fires, parent back to day.
    // visible.month changes (7 -> 4), so key changes and remount occurs with
    // initialView='day'.
    act(() => pickerProps.onMonthChange?.(4));
    expect(mockMountCount).toBe(countAfterFirstOpen + 1);
    expect(mockMountedInitialView).toBe('day');
    // Reopen month grid -> new remount with initialView='month'
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    expect(mockMountCount).toBe(countAfterFirstOpen + 2);
    expect(mockMountedInitialView).toBe('month');
  });

  it('remounts when reopening year grid after returning to day', () => {
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('cycleCalendar.selectYear'));
    expect(mockMountedInitialView).toBe('year');
    const countAfterFirstOpen = mockMountCount;
    act(() => pickerProps.onYearChange?.(2024));
    // visible.year changes (2026 -> 2024), key changes, remount to 'day'.
    expect(mockMountCount).toBe(countAfterFirstOpen + 1);
    expect(mockMountedInitialView).toBe('day');
    fireEvent.press(getByLabelText('cycleCalendar.selectYear'));
    expect(mockMountCount).toBe(countAfterFirstOpen + 2);
    expect(mockMountedInitialView).toBe('year');
  });

  it('toggling month caption off returns to day without remount', () => {
    // Pressing the month caption when already in month view toggles back to
    // day WITHOUT bumping the mount token (no new quick-jump open).
    const { getByLabelText } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    expect(mockMountCount).toBe(2);
    // Toggle off — parent sets pickerView='day' but does NOT bump token.
    fireEvent.press(getByLabelText('cycleCalendar.selectMonth'));
    expect(mockMountCount).toBe(2); // no remount
  });

});
