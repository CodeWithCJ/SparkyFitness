import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { HeartRateZonesResponse } from '@workspace/shared';

import HeartRateReportScreen from '../../src/screens/HeartRateReportScreen';
import { initializeI18n } from '../../src/localization/i18n';

const mockUseHeartRateZones = jest.fn();
const mockUseHeartRateReport = jest.fn();
jest.mock('../../src/hooks/useHeartRateZones', () => ({
  useHeartRateZones: () => mockUseHeartRateZones(),
}));
jest.mock('../../src/hooks/useHeartRateReport', () => ({
  useHeartRateReport: (args: unknown) => mockUseHeartRateReport(args),
}));
jest.mock('../../src/hooks/useReportCustomization', () => ({
  useReportCustomization: () => ({
    window: { days: 30 },
    rangeProps: {},
    isSectionShown: (id: string) => id === 'heartRate.zones',
  }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/components/reports/ReportScreenLayout', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});
jest.mock('victory-native', () => ({ CartesianChart: () => null }));

// Heart rate reserve, max 188, resting 68
const reserveZones: HeartRateZonesResponse = {
  settings: {
    max_heart_rate: 188,
    resting_heart_rate: 68,
    method: 'heart_rate_reserve',
    custom_floors: null,
    display_zones: 5,
  },
  resolved: {
    max_hr: 188,
    max_hr_source: 'user',
    resting_hr: 68,
    method: 'heart_rate_reserve',
    effective_method: 'heart_rate_reserve',
    zones: [
      { zone: 1, lower_bpm: 128, upper_bpm: 139 },
      { zone: 2, lower_bpm: 140, upper_bpm: 151 },
      { zone: 3, lower_bpm: 152, upper_bpm: 163 },
      { zone: 4, lower_bpm: 164, upper_bpm: 175 },
      { zone: 5, lower_bpm: 176, upper_bpm: null },
    ],
  },
};

const report = {
  days: [{ day: '2026-10-20', restingHr: 60 }],
  averageRestingHr: 60,
  minRestingHr: 60,
  maxRestingHr: 60,
  restingHrChange: null,
  avgRecovery1Min: null,
  daysWithData: 1,
  totalDaysInWindow: 30,
};

const navigate = jest.fn();
const renderScreen = () =>
  render(
    <HeartRateReportScreen
      {...({ navigation: { navigate, goBack: jest.fn() }, route: {} } as never)}
    />
  );

describe('HeartRateReportScreen zones', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    navigate.mockReset();
    mockUseHeartRateReport.mockReturnValue({
      report,
      isLoading: false,
      isError: false,
    });
  });

  it('lists the five zones from the person settings, not four tiers', () => {
    mockUseHeartRateZones.mockReturnValue({ zones: reserveZones });
    const { getByTestId, queryByText, getByText } = renderScreen();
    for (const zone of [1, 2, 3, 4, 5]) {
      expect(getByTestId(`heart-rate-zone-row-${zone}`)).toBeTruthy();
    }
    expect(getByText('128–139 bpm')).toBeTruthy();
    expect(getByText('152–163 bpm')).toBeTruthy();
    expect(getByText('176+ bpm')).toBeTruthy();
    expect(queryByText('Light')).toBeNull();
    expect(queryByText('Peak')).toBeNull();
    expect(getByTestId('heart-rate-zone-source').props.children).toContain(
      'Heart rate reserve'
    );
  });

  it('folds into four tiers when the person chose them', () => {
    mockUseHeartRateZones.mockReturnValue({
      zones: {
        ...reserveZones,
        settings: { ...reserveZones.settings, display_zones: 4 },
      },
    });
    const { getByText, queryByTestId } = renderScreen();
    expect(getByText('Light')).toBeTruthy();
    expect(getByText('128–151 bpm')).toBeTruthy();
    expect(getByText('Peak')).toBeTruthy();
    expect(queryByTestId('heart-rate-zone-row-5')).toBeNull();
  });

  it('follows a change of settings', () => {
    mockUseHeartRateZones.mockReturnValue({ zones: reserveZones });
    const view = renderScreen();
    expect(view.getByText('176+ bpm')).toBeTruthy();
    const changed: HeartRateZonesResponse = {
      ...reserveZones,
      resolved: {
        ...reserveZones.resolved,
        zones: reserveZones.resolved.zones.map((z) => ({
          ...z,
          lower_bpm: z.lower_bpm + 4,
          upper_bpm: z.upper_bpm === null ? null : z.upper_bpm + 4,
        })),
      },
    };
    mockUseHeartRateZones.mockReturnValue({ zones: changed });
    view.rerender(
      <HeartRateReportScreen
        {...({
          navigation: { navigate, goBack: jest.fn() },
          route: {},
        } as never)}
      />
    );
    expect(view.getByText('180+ bpm')).toBeTruthy();
  });

  it('shows the shared defaults and says so before zones load', () => {
    mockUseHeartRateZones.mockReturnValue({ zones: undefined });
    const { getByTestId, getByText } = renderScreen();
    expect(getByText('171+ bpm')).toBeTruthy();
    expect(getByTestId('heart-rate-zone-source').props.children).toContain(
      'until your own zones load'
    );
  });

  it('links to the zone settings', () => {
    mockUseHeartRateZones.mockReturnValue({ zones: reserveZones });
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('heart-rate-zone-settings-link'));
    expect(navigate).toHaveBeenCalledWith('HeartRateZonesSettings');
  });
});
