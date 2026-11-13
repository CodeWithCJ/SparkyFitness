import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  buildRunningTrends,
  predictRaceTimes,
  type RunningTrendsActivity,
} from '@workspace/shared';
import { RunningTrendsCard } from '@/components/ExerciseCharts/RunningTrendsCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string, options?: Record<string, string>) =>
      Object.entries(options ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        defaultValue
      ),
  }),
}));
// Recharts needs a laid-out container; the card's own figures are the point.
jest.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Box,
    BarChart: ({ data }: { data: unknown[] }) => (
      <div data-testid="weekly-bars" data-weeks={data.length} />
    ),
    Bar: Box,
    Cell: Box,
    CartesianGrid: Box,
    XAxis: Box,
    YAxis: Box,
    Tooltip: Box,
  };
});

const run = (
  entryDate: string,
  distanceMeters: number,
  extra: Partial<RunningTrendsActivity> = {}
): RunningTrendsActivity => ({
  exerciseName: 'Morning Run',
  category: 'running',
  entryDate,
  durationMinutes: distanceMeters / 200,
  distanceMeters,
  avgHeartRate: null,
  ...extra,
});

const convertDistance = (value: number, from: string, to: string) =>
  from === to ? value : value * 0.621371;

const trends = buildRunningTrends(
  [run('2026-08-25', 10000), run('2026-09-23', 15000)],
  { today: '2026-09-27' }
);

const renderCard = (
  overrides: Partial<React.ComponentProps<typeof RunningTrendsCard>> = {}
) =>
  render(
    <RunningTrendsCard
      trends={trends}
      raceTimes={[]}
      distanceUnit="km"
      convertDistance={convertDistance}
      formatWeekLabel={(day) => day.slice(5)}
      {...overrides}
    />
  );

describe('RunningTrendsCard', () => {
  it('shows this week, the longest run and a bar for each of the twelve weeks', () => {
    renderCard();
    expect(screen.getByTestId('running-this-week')).toHaveTextContent(
      '15.0 km'
    );
    expect(screen.getByTestId('running-longest')).toHaveTextContent('15.0 km');
    expect(screen.getByTestId('weekly-bars')).toHaveAttribute(
      'data-weeks',
      '12'
    );
    // No heart rate, so no efficiency trend yet.
    expect(screen.getByTestId('running-efficiency')).toHaveTextContent('—');
  });

  it('follows the distance unit', () => {
    renderCard({ distanceUnit: 'miles' });
    expect(screen.getByTestId('running-this-week')).toHaveTextContent('9.3 mi');
  });

  it('compares this week with the recent average', () => {
    // Only one earlier week, so the four-week average is 2.5 km.
    renderCard();
    expect(
      screen.getByText(/This week, \d+% above your recent average/)
    ).toBeInTheDocument();
  });

  it('lists race estimates only when there are some', () => {
    const { rerender } = renderCard();
    expect(screen.queryByTestId('running-race-times')).toBeNull();

    rerender(
      <RunningTrendsCard
        trends={trends}
        raceTimes={predictRaceTimes([
          { distanceStandard: '5k', bestTimeSeconds: 1500 },
        ])}
        distanceUnit="km"
        convertDistance={convertDistance}
        formatWeekLabel={(day) => day.slice(5)}
      />
    );
    const list = screen.getByTestId('running-race-times');
    expect(list).toHaveTextContent('5K');
    expect(list).toHaveTextContent('25:00');
    expect(list).toHaveTextContent('your record');
    expect(list).toHaveTextContent('10K');
    expect(list).toHaveTextContent('from your 5K');
    expect(list).not.toHaveTextContent('Marathon');
  });
});
