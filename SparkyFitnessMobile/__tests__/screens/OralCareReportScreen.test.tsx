import React from 'react';
import { render, screen } from '@testing-library/react-native';

import OralCareReportScreen from '../../src/screens/OralCareReportScreen';
import { __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';

const mockUseOralCareRange = jest.fn();
jest.mock('../../src/components/DateRangeSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(() => <View testID="date-range-sheet" />),
  };
});
jest.mock('../../src/hooks/useOralCare', () => ({
  useOralCareRange: (start: string, end: string) =>
    mockUseOralCareRange(start, end),
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
      <View testID={`chart-${testIDPrefix}`} />
    ),
  };
});

const day = (date: string, brushing_count: number, goal_met: boolean) => ({
  date,
  brushing_count,
  brushing_seconds: brushing_count * 120,
  goal_met,
  other_count: 1,
});

const renderScreen = () =>
  render(
    <OralCareReportScreen
      {...({
        navigation: { navigate: jest.fn(), goBack: jest.fn() },
        route: { params: {} },
      } as never)}
    />
  );

describe('OralCareReportScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    mockUseOralCareRange.mockReset();
  });

  it('shows the goal days, both charts and the streaks', () => {
    mockUseOralCareRange.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        settings: { daily_target: 2, target_seconds: 120 },
        days: [day('2026-11-07', 2, true), day('2026-11-08', 1, false)],
        streak: 1,
        best_streak: 4,
        recent_custom_labels: [],
      },
    });
    renderScreen();
    expect(screen.getByText('1 of 2 days')).toBeTruthy();
    expect(screen.getByTestId('chart-oral-care-brushes')).toBeTruthy();
    expect(screen.getByTestId('chart-oral-care-minutes')).toBeTruthy();
    expect(screen.getByText('4 days')).toBeTruthy();
    expect(screen.getByText('Your longest streak is 4 days.')).toBeTruthy();
  });

  it('says so when nothing was logged', () => {
    mockUseOralCareRange.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        settings: { daily_target: 2, target_seconds: 120 },
        days: [{ ...day('2026-11-08', 0, false), other_count: 0 }],
        streak: 0,
        best_streak: 0,
        recent_custom_labels: [],
      },
    });
    renderScreen();
    expect(
      screen.getAllByText('No oral care logged in this period').length
    ).toBeGreaterThan(0);
  });
});
