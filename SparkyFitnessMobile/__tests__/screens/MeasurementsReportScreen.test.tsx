import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import MeasurementsReportScreen from '../../src/screens/MeasurementsReportScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import { buildMeasurementsReport } from '../../src/utils/measurementsReport';
import type { CheckInMeasurementRange } from '../../src/types/measurements';

jest.mock('../../src/components/reports/MeasurementTimelineCard', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: function MockMeasurementTimelineCard() {
      const [selection, setSelection] = useState('default timeline state');
      return (
        <Pressable
          testID="measurement-timeline"
          onPress={() => setSelection('selected day, zoom and layers')}
        >
          <Text>{selection}</Text>
        </Pressable>
      );
    },
  };
});
const mockUseMeasurementsReport = jest.fn();
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
jest.mock('../../src/hooks/useMeasurementsReport', () => ({
  useMeasurementsReport: (args: unknown) => mockUseMeasurementsReport(args),
}));
jest.mock('../../src/hooks', () => ({
  useServerConnection: () => ({ isConnected: true }),
  usePreferences: () => ({
    preferences: { default_weight_unit: 'kg', default_measurement_unit: 'cm' },
  }),
  useProfile: () => ({ profile: { target_weight: '75' } }),
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
jest.mock('../../src/components/WeightLineChart', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="weight-chart" /> };
});
jest.mock('../../src/components/StepsBarChart', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="steps-chart" /> };
});

const row = (
  entry_date: string,
  overrides: Partial<CheckInMeasurementRange>
): CheckInMeasurementRange => ({
  id: entry_date,
  user_id: 'u',
  entry_date,
  updated_at: `${entry_date}T08:00:00Z`,
  ...overrides,
});

const report = buildMeasurementsReport(
  [
    row('2026-10-01', {
      weight: 82,
      body_fat_percentage: 21,
      waist: 90,
      steps: 5000,
    }),
    row('2026-10-05', {
      weight: 80,
      body_fat_percentage: 20,
      waist: 88,
      steps: 7000,
    }),
  ],
  '2026-10-01',
  5
);

const renderScreen = () =>
  render(
    <MeasurementsReportScreen
      {...({
        navigation: { navigate: jest.fn(), goBack: jest.fn() },
        route: { params: {} },
      } as never)}
    />
  );

describe('MeasurementsReportScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    mockUseMeasurementsReport.mockReset();
    mockUseMeasurementsReport.mockReturnValue({
      report,
      isLoading: false,
      isError: false,
    });
  });

  it.each(['loading', 'error'] as const)(
    'preserves timeline selections through %s, loaded and empty states',
    (state) => {
      mockUseMeasurementsReport.mockReturnValue({
        report: undefined,
        isLoading: state === 'loading',
        isError: state === 'error',
      });
      const screen = renderScreen();
      fireEvent.press(screen.getByTestId('measurement-timeline'));

      for (const nextReport of [
        report,
        buildMeasurementsReport([], '2026-10-01', 5),
        undefined,
        report,
      ]) {
        mockUseMeasurementsReport.mockReturnValue({
          report: nextReport,
          isLoading: nextReport === undefined,
          isError: false,
        });
        screen.rerender(<MeasurementsReportScreen />);
        expect(screen.getByText('selected day, zoom and layers')).toBeTruthy();
      }
    }
  );

  it('shows the key figures with changes, the charts and the summary cards', () => {
    const { getByTestId, getAllByText } = renderScreen();

    expect(getByTestId('measurements-highlight-weight')).toBeTruthy();
    expect(getAllByText('-2 kg').length).toBeGreaterThan(0);
    expect(getByTestId('weight-chart')).toBeTruthy();
    expect(getByTestId('steps-chart')).toBeTruthy();
    expect(getByTestId('measurements-weight-to-goal')).toBeTruthy();
    expect(getByTestId('measurements-body_fat_percentage')).toBeTruthy();
    expect(getByTestId('measurements-waist')).toBeTruthy();
  });

  it('leaves out the sections turned off in Customize Reports', () => {
    useAppPreferencesStore.setState({
      hiddenReportSections: [
        'measurements.weightChart',
        'measurements.stepsChart',
        'measurements.tape',
        'measurements.timeline',
      ],
    });

    const { queryByTestId, getByTestId } = renderScreen();

    expect(queryByTestId('measurement-timeline')).toBeNull();
    expect(queryByTestId('weight-chart')).toBeNull();
    expect(queryByTestId('steps-chart')).toBeNull();
    expect(queryByTestId('measurements-waist')).toBeNull();
    expect(getByTestId('measurements-body_fat_percentage')).toBeTruthy();
  });

  it('says so when nothing was recorded', () => {
    mockUseMeasurementsReport.mockReturnValue({
      report: buildMeasurementsReport([], '2026-10-01', 5),
      isLoading: false,
      isError: false,
    });

    const { getByText, getByTestId } = renderScreen();
    expect(getByTestId('measurement-timeline')).toBeTruthy();

    expect(getByText('No body measurements in this period')).toBeTruthy();
  });
});

it.each(['loading', 'error'] as const)(
  'does not mount a hidden timeline in the %s branch',
  async (state) => {
    __resetAppPreferencesStoreForTests();
    await initializeI18n('en');
    useAppPreferencesStore.setState({
      hiddenReportSections: ['measurements.timeline'],
    });
    mockUseMeasurementsReport.mockReturnValue({
      report: undefined,
      isLoading: state === 'loading',
      isError: state === 'error',
    });
    const { queryByTestId } = render(<MeasurementsReportScreen />);
    expect(queryByTestId('measurement-timeline')).toBeNull();
  }
);
