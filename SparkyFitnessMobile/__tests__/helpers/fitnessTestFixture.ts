import {
  evaluateFitnessTest,
  type FitnessTestMeasurement,
  type FitnessTestResponse,
} from '@workspace/shared';

/** What `useFitnessTests` returns for a person with these tests (newest first). */
export const fitnessTestsHook = (tests: FitnessTestResponse[] = []) => ({
  tests,
  latest: tests[0] ?? null,
  loaded: true,
  isLoading: false,
  refetch: jest.fn(),
});

const DEFAULT_MEASUREMENT: FitnessTestMeasurement = {
  type: '5k',
  distanceMeters: 5000,
  durationSeconds: 1500,
};

/** A saved test, built the way the server builds it: from the measurements. */
export function fitnessTest(
  overrides: Partial<FitnessTestResponse> & {
    measurement?: FitnessTestMeasurement;
  } = {}
): FitnessTestResponse {
  const { measurement = DEFAULT_MEASUREMENT, ...rest } = overrides;
  const outcome = evaluateFitnessTest(measurement)!;
  return {
    id: 'test-1',
    test_type: measurement.type,
    test_date: '2026-10-01',
    distance_meters: measurement.distanceMeters,
    duration_seconds: measurement.durationSeconds,
    split_distance_meters: measurement.splitDistanceMeters ?? null,
    result_value: outcome.resultValue,
    exercise_entry_id: null,
    // A measurement with an incline is a treadmill test.
    surface: measurement.inclinePercent != null ? 'indoor' : 'outdoor',
    incline_percent: measurement.inclinePercent ?? null,
    incline_adjusted:
      measurement.inclinePercent != null &&
      measurement.adjustForIncline !== false,
    paces: outcome.paces,
    created_at: '2026-10-01T10:00:00.000Z',
    ...rest,
  };
}
