import React from 'react';
import { render } from '@testing-library/react-native';
import DateRangeSheet from '../../src/components/DateRangeSheet';

const pickerProps: {
  components?: { Day?: (day: unknown) => React.ReactNode };
} = {};

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return <View>{props.children}</View>;
    }),
    BottomSheetView: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('react-native-ui-datepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => {
      Object.assign(pickerProps, props);
      return <View testID="date-picker" />;
    },
  };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

// Reads preferences through a query, which this suite has no client for.
jest.mock('../../src/utils/calendarLocalization', () => ({
  useCalendarPresentation: () => ({
    appLocale: 'en',
    presentation: { locale: 'en', firstDayOfWeek: 0 },
  }),
}));

/**
 * The library types CalendarDay.date as `string` but hands the override its
 * internal dayjs value. This models that: a valueOf-bearing object with no
 * string methods, so reading it as a string would throw here as it would on
 * device.
 */
const dayValue = (year: number, month: number, date: number) => {
  const instant = new Date(year, month - 1, date, 12, 0).getTime();
  return { valueOf: () => instant };
};

const calendarDay = (
  year: number,
  month: number,
  date: number,
  overrides: Record<string, unknown> = {}
) => ({
  text: String(date),
  number: date,
  date: dayValue(year, month, date),
  isDisabled: false,
  isCurrentMonth: true,
  isToday: false,
  isSelected: false,
  rangeStart: false,
  rangeEnd: false,
  ...overrides,
});

const renderDay = (
  markedDates: string[] | undefined,
  day: ReturnType<typeof calendarDay>
) => {
  render(<DateRangeSheet onConfirm={jest.fn()} markedDates={markedDates} />);
  const Day = pickerProps.components?.Day;
  if (!Day) throw new Error('expected a Day override to be supplied');
  return render(<>{Day(day)}</>);
};

/**
 * The range sheet dots the same days the single-date sheet does. Without it, the
 * time-lapse asked the user to draw a range around photos it would not show them.
 */
describe('DateRangeSheet markedDates', () => {
  beforeEach(() => {
    delete pickerProps.components;
  });

  it('marks a day that has a photo', () => {
    const { queryByTestId } = renderDay(
      ['2026-09-02'],
      calendarDay(2026, 9, 2)
    );

    expect(queryByTestId('calendar-day-marked')).toBeTruthy();
  });

  it('leaves other days unmarked', () => {
    const { queryByTestId } = renderDay(
      ['2026-09-02'],
      calendarDay(2026, 9, 3)
    );

    expect(queryByTestId('calendar-day-marked')).toBeNull();
    expect(queryByTestId('calendar-day-unmarked')).toBeTruthy();
  });

  it('still renders the day number', () => {
    const { getByText } = renderDay(['2026-09-02'], calendarDay(2026, 9, 2));

    expect(getByText('2')).toBeTruthy();
  });

  it('supplies no Day override when there is nothing to mark', () => {
    // The writeback consumer passes no dates and must keep the library's own
    // cell rather than this reimplementation of it.
    render(<DateRangeSheet onConfirm={jest.fn()} />);
    expect(pickerProps.components?.Day).toBeUndefined();

    render(<DateRangeSheet onConfirm={jest.fn()} markedDates={[]} />);
    expect(pickerProps.components?.Day).toBeUndefined();
  });

  it('inverts a marked dot on both ends of a range', () => {
    // Range ends carry the same solid accent fill a single selection does, so an
    // accent dot on top of it would be invisible.
    for (const end of ['rangeStart', 'rangeEnd']) {
      const { queryByTestId } = renderDay(
        ['2026-09-02'],
        calendarDay(2026, 9, 2, { [end]: true })
      );

      expect(queryByTestId('calendar-day-marked')?.props.style).toEqual(
        expect.objectContaining({ backgroundColor: '#FFFFFF' })
      );
    }
  });
});
