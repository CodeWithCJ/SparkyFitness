import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { GpsTrackPoint } from '@workspace/shared';
import ActivityReportVisualizer from '@/pages/Reports/ActivityReportVisualizer';
import { useWorkoutGpsPoints } from '@/hooks/useGenericHealth';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : _key,
  }),
}));
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    distanceUnit: 'km',
    convertDistance: (value: number) => value,
    loggingLevel: 'info',
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    water_display_unit: 'ml',
    timezone: 'UTC',
    timeFormat: '24h',
  }),
}));
jest.mock('@/hooks/Exercises/useExercises', () => ({
  useExerciseEntryById: () => ({ data: undefined, isLoading: false }),
  useActivityDetailsQuery: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/hooks/useGenericHealth', () => ({
  useWorkoutGpsPoints: jest.fn(),
  useWorkoutLaps: () => ({ data: undefined }),
  useWorkoutHrZones: () => ({ data: undefined }),
  useHealthMetricSamples: () => ({ data: undefined }),
}));
jest.mock('@/pages/Reports/ActivityReportMap', () => ({
  __esModule: true,
  default: () => <div data-testid="map" />,
}));
// The charts draw with recharts; what matters here is whether they appear and
// which axis the pace chart is given.
jest.mock('@/components/ExerciseCharts/ActivityPaceChart', () => ({
  ActivityPaceChart: ({
    data,
    xAxisMode,
    getXAxisDataKey,
  }: {
    data: unknown[];
    xAxisMode: string;
    getXAxisDataKey: () => string;
  }) => (
    <div
      data-testid="pace-chart"
      data-points={data.length}
      data-axis={xAxisMode}
      data-key={getXAxisDataKey()}
    />
  ),
}));
jest.mock('@/components/ExerciseCharts/ActivityHeartRateChart', () => ({
  ActivityHeartRateChart: () => <div data-testid="heart-rate-chart" />,
}));

const point = (
  seconds: number,
  dist: number,
  extra: Partial<GpsTrackPoint> = {}
): GpsTrackPoint => ({
  t: new Date(Date.UTC(2026, 9, 6, 7, 0, seconds)).toISOString(),
  lat: 51.5 + dist / 111_194.9,
  lon: -0.12,
  dist,
  ...extra,
});

const mockGps = (points: GpsTrackPoint[] | undefined) =>
  (useWorkoutGpsPoints as jest.Mock).mockReturnValue({
    data: points ? { points } : undefined,
    isLoading: false,
  });

describe('ActivityReportVisualizer (outdoor variant)', () => {
  it('shows a pace chart against distance for a route with speed', () => {
    mockGps([
      point(0, 0, { speed: 3 }),
      point(10, 30, { speed: 3 }),
      point(20, 60, { speed: 3.1 }),
    ]);
    render(
      <ActivityReportVisualizer
        exerciseEntryId="entry-1"
        providerName="manual"
        variant="outdoor"
      />
    );
    const chart = screen.getByTestId('pace-chart');
    expect(chart).toHaveAttribute('data-points', '3');
    expect(chart).toHaveAttribute('data-axis', 'distance');
    expect(chart).toHaveAttribute('data-key', 'distance');
  });

  it('has no pace chart when the track carries no speed', () => {
    mockGps([point(0, 0), point(10, 30), point(20, 60)]);
    render(
      <ActivityReportVisualizer
        exerciseEntryId="entry-1"
        providerName="manual"
        variant="outdoor"
      />
    );
    expect(screen.queryByTestId('pace-chart')).toBeNull();
  });

  it('has no pace chart without a route', () => {
    mockGps(undefined);
    render(
      <ActivityReportVisualizer
        exerciseEntryId="entry-1"
        providerName="manual"
        variant="outdoor"
      />
    );
    expect(screen.queryByTestId('pace-chart')).toBeNull();
  });
});
