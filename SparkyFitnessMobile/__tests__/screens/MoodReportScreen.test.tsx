import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import MoodReportScreen from '../../src/screens/MoodReportScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import type { MoodReport } from '../../src/utils/moodReport';

const mockUseMoodReport = jest.fn();
jest.mock('../../src/components/DateRangeSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(
      (
        props: { onConfirm: (from: string, to: string) => void },
        ref: unknown
      ) => {
        React.useImperativeHandle(ref, () => ({
          present: () => props.onConfirm('2026-09-01', '2026-09-20'),
          dismiss: () => undefined,
        }));
        return <View testID="date-range-sheet" />;
      }
    ),
  };
});
jest.mock('../../src/hooks/useMoodReport', () => ({
  useMoodReport: (args: unknown) => mockUseMoodReport(args),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/TrendBarChart', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ testIDPrefix }: { testIDPrefix: string }) => (
      <View testID={testIDPrefix} />
    ),
  };
});

const report: MoodReport = {
  days: [],
  loggedDays: 4,
  averageValue: 70,
  topTags: [{ tag: 'happy', count: 3 }],
  best: { day: '2026-07-02', value: 90, entries: 1 },
  lowest: { day: '2026-07-03', value: 30, entries: 1 },
  weekdayAverages: [
    { weekday: 1, value: 60 },
    { weekday: 2, value: 80 },
  ],
};

const renderScreen = () =>
  render(
    <MoodReportScreen
      {...({
        navigation: { navigate: jest.fn(), goBack: jest.fn() },
        route: { params: {} },
      } as never)}
    />
  );

describe('MoodReportScreen customization', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    mockUseMoodReport.mockReset();
    mockUseMoodReport.mockReturnValue({
      report,
      previousReport: null,
      isLoading: false,
      isError: false,
    });
  });

  it('shows every section by default, including the key figures', () => {
    const { getByTestId } = renderScreen();

    expect(getByTestId('mood-highlight-average')).toBeTruthy();
    expect(getByTestId('mood-chart')).toBeTruthy();
    expect(getByTestId('mood-average')).toBeTruthy();
    expect(getByTestId('mood-best-day')).toBeTruthy();
    expect(getByTestId('mood-weekday-1')).toBeTruthy();
    expect(getByTestId('mood-tag-happy')).toBeTruthy();
  });

  it('leaves out the sections turned off in Customize Reports', () => {
    useAppPreferencesStore.setState({
      hiddenReportSections: [
        'mood.overview',
        'mood.chart',
        'mood.byWeekday',
        'mood.topMoods',
      ],
    });

    const { queryByTestId, getByTestId } = renderScreen();

    expect(queryByTestId('mood-highlight-average')).toBeNull();
    expect(queryByTestId('mood-chart')).toBeNull();
    expect(queryByTestId('mood-weekday-1')).toBeNull();
    expect(queryByTestId('mood-tag-happy')).toBeNull();
    expect(getByTestId('mood-average')).toBeTruthy();
    expect(getByTestId('mood-best-day')).toBeTruthy();
  });

  it('opens on the saved default range and still lets the wearer switch it', () => {
    useAppPreferencesStore.setState({ reportDefaultRange: '7d' });

    const { getByText } = renderScreen();

    expect(mockUseMoodReport).toHaveBeenLastCalledWith({
      window: expect.objectContaining({ days: 7, chartRange: '7d' }),
    });
    fireEvent.press(getByText('90d'));
    expect(mockUseMoodReport).toHaveBeenLastCalledWith({
      window: expect.objectContaining({ days: 90, chartRange: '90d' }),
    });
    expect(useAppPreferencesStore.getState().reportDefaultRange).toBe('7d');
  });
});
