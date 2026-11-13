import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithClient } from '@/tests/test-utils';
import { ActivityHeartRateZonesChart } from '@/components/ExerciseCharts/ActivityHeartRateZoneChart';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: string | ({ defaultValue?: string } & Record<string, unknown>)
    ) =>
      typeof options === 'string'
        ? options
        : options?.defaultValue?.replace(/{{(\w+)}}/g, (_m, name) =>
            String(options[name])
          ),
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

describe('ActivityHeartRateZonesChart zone method', () => {
  it('says which method the stored zones were worked out with', () => {
    renderWithClient(
      <ActivityHeartRateZonesChart
        data={zoneData}
        providerName="healthkit"
        zoneMethod="heart_rate_reserve"
      />
    );

    expect(screen.getByTestId('hr-zones-method')).toHaveTextContent(
      'Zones: Heart rate reserve. Changing your zone settings does not change past workouts.'
    );
    // A stored method replaces the age-estimate note, which may no longer be true.
    expect(screen.queryByText(ESTIMATE_NOTE)).not.toBeInTheDocument();
  });

  it('says the zones came from the device for Garmin', () => {
    renderWithClient(
      <ActivityHeartRateZonesChart
        data={zoneData}
        providerName="garmin"
        zoneMethod="device"
      />
    );

    expect(screen.getByTestId('hr-zones-method')).toHaveTextContent(
      'Zones set by your watch or device.'
    );
  });

  it('flags a workout whose entries used different methods', () => {
    renderWithClient(
      <ActivityHeartRateZonesChart data={zoneData} zoneMethod="mixed" />
    );

    expect(screen.getByTestId('hr-zones-method')).toHaveTextContent(
      'more than one method'
    );
  });

  it('shows no method line for a workout stored before methods were recorded', () => {
    renderWithClient(
      <ActivityHeartRateZonesChart data={zoneData} zoneMethod={null} />
    );

    expect(screen.queryByTestId('hr-zones-method')).not.toBeInTheDocument();
  });
});
