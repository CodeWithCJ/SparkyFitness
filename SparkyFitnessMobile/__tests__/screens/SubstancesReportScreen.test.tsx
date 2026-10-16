import React from 'react';
import { render } from '@testing-library/react-native';

import SubstancesReportScreen from '../../src/screens/SubstancesReportScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import { buildSubstancesReport } from '../../src/utils/substancesReport';
import type { NutritionTrendPoint } from '../../src/services/api/reportsApi';

jest.mock('../../src/components/DateRangeSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(function MockDateRangeSheet() {
      return <View testID="date-range-sheet" />;
    }),
  };
});
const mockUseSubstancesReport = jest.fn();
jest.mock('../../src/hooks/useSubstancesReport', () => ({
  useSubstancesReport: (args: unknown) => mockUseSubstancesReport(args),
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

const point = (
  date: string,
  caffeine: number,
  alcohol: number
): NutritionTrendPoint =>
  ({
    date,
    calories: 2000,
    caffeine_mg: caffeine,
    alcohol_g: alcohol,
    water_ml: 0,
  }) as NutritionTrendPoint;

const days = [
  point('2026-10-01', 200, 0),
  point('2026-10-02', 500, 28),
  point('2026-10-03', 0, 0),
  point('2026-10-04', 300, 14),
  point('2026-10-05', 0, 0),
  point('2026-10-06', 100, 0),
  point('2026-10-07', 0, 0),
  point('2026-10-08', 0, 0),
];

const renderScreen = () =>
  render(
    <SubstancesReportScreen
      {...({
        navigation: { navigate: jest.fn(), goBack: jest.fn() },
        route: { params: {} },
      } as never)}
    />
  );

describe('SubstancesReportScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    mockUseSubstancesReport.mockReset();
    mockUseSubstancesReport.mockReturnValue({
      report: buildSubstancesReport(days, [], Array(8).fill(null)),
      isLoading: false,
      isError: false,
    });
  });

  it('shows the key figures, both charts, both summaries and the weeks', () => {
    const { getByTestId } = renderScreen();

    expect(getByTestId('substances-highlight-caffeine')).toBeTruthy();
    expect(getByTestId('substances-highlight-alcohol')).toBeTruthy();
    expect(getByTestId('substances-caffeine-chart')).toBeTruthy();
    expect(getByTestId('substances-alcohol-chart')).toBeTruthy();
    expect(getByTestId('substances-caffeine-over')).toBeTruthy();
    expect(getByTestId('substances-alcohol-days')).toBeTruthy();
    expect(getByTestId('substances-week-0')).toBeTruthy();
  });

  it('headlines each week with caffeine in mg and labels the alcohol', () => {
    const { getAllByText } = renderScreen();

    expect(
      getAllByText(/caffeine a day · .* g alcohol/).length
    ).toBeGreaterThan(0);
  });

  it('says what stood out', () => {
    const { getByText } = renderScreen();

    expect(
      getByText('You went over 400 mg of caffeine on 1 day.')
    ).toBeTruthy();
    expect(
      getByText('6 of your 8 logged days were alcohol-free.')
    ).toBeTruthy();
  });

  it('leaves out the sections turned off in Customize Reports', () => {
    useAppPreferencesStore.setState({
      hiddenReportSections: [
        'substances.caffeineChart',
        'substances.alcohol',
        'substances.weekly',
        'substances.insights',
      ],
    });

    const { queryByTestId, queryByText } = renderScreen();

    expect(queryByTestId('substances-caffeine-chart')).toBeNull();
    expect(queryByTestId('substances-alcohol-days')).toBeNull();
    expect(queryByTestId('substances-week-0')).toBeNull();
    expect(queryByText('What stood out')).toBeNull();
    expect(queryByTestId('substances-alcohol-chart')).toBeTruthy();
  });

  it('says so when nothing was logged', () => {
    mockUseSubstancesReport.mockReturnValue({
      report: buildSubstancesReport([point('2026-10-01', 0, 0)], [], [null]),
      isLoading: false,
      isError: false,
    });

    const { getByText } = renderScreen();

    expect(
      getByText('No caffeine or alcohol logged in this period')
    ).toBeTruthy();
  });
});
