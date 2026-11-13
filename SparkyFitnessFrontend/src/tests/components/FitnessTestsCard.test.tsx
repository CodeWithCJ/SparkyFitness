import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  evaluateFitnessTest,
  type FitnessTestMeasurement,
  type FitnessTestResponse,
} from '@workspace/shared';
import { FitnessTestsCard } from '@/components/ExerciseCharts/FitnessTestsCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      options?: Record<string, unknown>
    ) =>
      Object.entries(options ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        defaultValue
      ),
  }),
}));

const test = (
  id: string,
  testDate: string,
  measurement: FitnessTestMeasurement
): FitnessTestResponse => {
  const outcome = evaluateFitnessTest(measurement)!;
  return {
    id,
    test_type: measurement.type,
    test_date: testDate,
    distance_meters: measurement.distanceMeters,
    duration_seconds: measurement.durationSeconds,
    split_distance_meters: measurement.splitDistanceMeters ?? null,
    result_value: outcome.resultValue,
    exercise_entry_id: null,
    surface: measurement.inclinePercent != null ? 'indoor' : 'outdoor',
    incline_percent: measurement.inclinePercent ?? null,
    incline_adjusted:
      measurement.inclinePercent != null &&
      measurement.adjustForIncline !== false,
    paces: outcome.paces,
    created_at: `${testDate}T10:00:00.000Z`,
  };
};

const fiveK = test('a', '2026-10-01', {
  type: '5k',
  distanceMeters: 5000,
  durationSeconds: 1500,
});
const cooper = test('b', '2026-08-01', {
  type: 'cooper',
  distanceMeters: 2800,
  durationSeconds: 720,
});
const thirty = test('c', '2026-06-01', {
  type: '30min',
  distanceMeters: 6600,
  splitDistanceMeters: 2000,
  durationSeconds: 1800,
});

const renderCard = (
  tests: FitnessTestResponse[],
  props: { distanceUnit?: 'km' | 'miles'; today?: string } = {}
) =>
  render(
    <FitnessTestsCard
      tests={tests}
      distanceUnit={props.distanceUnit ?? 'km'}
      today={props.today ?? '2026-10-18'}
      formatDay={(day) => `on ${day}`}
    />
  );

describe('FitnessTestsCard', () => {
  it('shows nothing without a test', () => {
    renderCard([]);
    expect(screen.queryByTestId('fitness-tests-card')).not.toBeInTheDocument();
  });

  it('shows the latest result, its threshold pace and the training paces', () => {
    renderCard([fiveK]);
    expect(screen.getByText('5K in 25:00')).toBeInTheDocument();
    expect(
      screen.getByText(
        /5K time trial on on 2026-10-01\. Threshold pace \d:\d\d\/km\./
      )
    ).toBeInTheDocument();
    const paces = within(screen.getByTestId('fitness-tests-paces'));
    expect(paces.getAllByRole('listitem')).toHaveLength(5);
    expect(paces.getByText('Easy')).toBeInTheDocument();
    expect(paces.getByText('Repetition')).toBeInTheDocument();
  });

  it('shows the paces per mile for a runner who uses miles', () => {
    renderCard([fiveK], { distanceUnit: 'miles' });
    expect(
      within(screen.getByTestId('fitness-tests-paces')).getAllByText(/\/mi/)
    ).toHaveLength(5);
  });

  it('words each kind of result', () => {
    renderCard([fiveK, cooper, thirty]);
    const history = within(screen.getByTestId('fitness-tests-history'));
    expect(history.getByText(/2800 m in 12 minutes/)).toBeInTheDocument();
    expect(
      history.getByText(/4:21\/km over the last 20 minutes/)
    ).toBeInTheDocument();
    expect(history.getAllByRole('listitem')).toHaveLength(2);
  });

  it('lists a cooper distance in miles', () => {
    renderCard([cooper], { distanceUnit: 'miles' });
    expect(screen.getByText('1.74 mi in 12 minutes')).toBeInTheDocument();
  });

  it('has no history for a single test', () => {
    renderCard([fiveK]);
    expect(
      screen.queryByTestId('fitness-tests-history')
    ).not.toBeInTheDocument();
  });

  it('keeps the history short', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...fiveK,
      id: `t${i}`,
    }));
    renderCard(many);
    // The latest is the headline; four earlier ones are listed.
    expect(
      within(screen.getByTestId('fitness-tests-history')).getAllByRole(
        'listitem'
      )
    ).toHaveLength(4);
  });

  it('suggests a retest from six weeks on', () => {
    const { rerender } = renderCard([fiveK], { today: '2026-11-11' });
    expect(
      screen.queryByTestId('fitness-tests-retest')
    ).not.toBeInTheDocument();
    rerender(
      <FitnessTestsCard
        tests={[fiveK]}
        distanceUnit="km"
        today="2026-11-12"
        formatDay={(day) => day}
      />
    );
    expect(screen.getByTestId('fitness-tests-retest')).toHaveTextContent(
      'Your last test was 6 weeks ago'
    );
  });

  it('marks a treadmill test with its incline', () => {
    const treadmill = test('t', '2026-10-10', {
      type: 'cooper',
      distanceMeters: 3000,
      durationSeconds: 720,
      inclinePercent: 3,
    });
    renderCard([treadmill, fiveK]);
    expect(screen.getByTestId('fitness-tests-surface')).toHaveTextContent(
      'Treadmill, 3% incline, adjusted'
    );
    // The headline is the corrected result.
    expect(screen.getByText('3258 m in 12 minutes')).toBeInTheDocument();
  });

  it('marks a treadmill test in the history, and an outdoor one not at all', () => {
    const treadmill = test('t', '2026-08-10', {
      type: 'cooper',
      distanceMeters: 3000,
      durationSeconds: 720,
      inclinePercent: 1,
    });
    renderCard([fiveK, treadmill]);
    expect(
      within(screen.getByTestId('fitness-tests-history')).getByText(
        /Treadmill, 1% incline, adjusted/
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('fitness-tests-surface')
    ).not.toBeInTheDocument();
  });
});
