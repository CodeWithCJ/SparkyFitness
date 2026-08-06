import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithClient } from '@/tests/test-utils';
import { ActivityHeartRateZonesChart } from '@/components/ExerciseCharts/ActivityHeartRateZoneChart';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

const zoneData = [
  { name: 'Zone 1 (95 bpm)', 'Time in Zone (s)': 398 },
  { name: 'Zone 2 (113 bpm)', 'Time in Zone (s)': 468 },
];

const ESTIMATE_NOTE =
  "Zones are estimated from your age — Apple Health and Health Connect don't share a configured max heart rate with apps.";

describe('ActivityHeartRateZonesChart max-HR source note', () => {
  it.each(['HealthKit', 'healthkit', 'Health Connect', 'health connect'])(
    'shows the age-estimate note for provider "%s"',
    (providerName) => {
      renderWithClient(
        <ActivityHeartRateZonesChart
          data={zoneData}
          providerName={providerName}
        />
      );

      expect(screen.getByText(ESTIMATE_NOTE)).toBeInTheDocument();
    }
  );

  it('does not show the note for Garmin, which sends its own device-configured zones', () => {
    renderWithClient(
      <ActivityHeartRateZonesChart data={zoneData} providerName="garmin" />
    );

    expect(screen.queryByText(ESTIMATE_NOTE)).not.toBeInTheDocument();
  });

  it('does not show the note when providerName is absent', () => {
    renderWithClient(<ActivityHeartRateZonesChart data={zoneData} />);

    expect(screen.queryByText(ESTIMATE_NOTE)).not.toBeInTheDocument();
  });
});
