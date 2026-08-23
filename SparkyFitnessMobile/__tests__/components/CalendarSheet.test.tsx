import React from 'react';
import { View } from 'react-native';
import { render, act } from '@testing-library/react-native';
import CalendarSheet from '../../src/components/CalendarSheet';

const pickerProps: { month?: number; year?: number } = {};

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
  useCalendarPresentation: () => ({ appLocale: 'en', presentation: { locale: 'en', firstDayOfWeek: 0 } }),
  getCalendarWeekdayShortNames: () => [],
  getCalendarMonthNames: () => Array.from({ length: 12 }, (_, index) => `month-${index}`),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('CalendarSheet', () => {
  beforeEach(() => {
    pickerProps.month = undefined;
    pickerProps.year = undefined;
  });

  it('syncs the visible month when selectedDate changes without unmounting', () => {
    const { rerender } = render(
      <CalendarSheet selectedDate="2026-08-23" onSelectDate={jest.fn()} />,
    );

    expect(pickerProps).toMatchObject({ month: 7, year: 2026 });

    act(() => {
      rerender(<CalendarSheet selectedDate="2026-09-02" onSelectDate={jest.fn()} />);
    });

    expect(pickerProps).toMatchObject({ month: 8, year: 2026 });
  });
});
