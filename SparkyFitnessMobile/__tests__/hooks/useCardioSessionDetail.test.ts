import { renderHook, waitFor } from '@testing-library/react-native';
import type { HealthMetricSamples } from '@workspace/shared';
import { useCardioSessionDetail } from '../../src/hooks/useCardioSessionDetail';
import {
  fetchExerciseEntry,
  fetchHeartRateSamples,
  fetchExerciseEntryDistanceSeries,
  fetchWorkoutGpsPoints,
  fetchWorkoutHrZones,
} from '../../src/services/api/exerciseStatsApi';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/exerciseStatsApi', () => ({
  fetchExerciseEntry: jest.fn(),
  fetchHeartRateSamples: jest.fn(),
  fetchWorkoutGpsPoints: jest.fn(),
  fetchExerciseEntryDistanceSeries: jest.fn(),
  fetchWorkoutHrZones: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { timezone: 'UTC' } }),
}));

const mockGps = fetchWorkoutGpsPoints as jest.MockedFunction<
  typeof fetchWorkoutGpsPoints
>;
const mockSeries = fetchExerciseEntryDistanceSeries as jest.MockedFunction<
  typeof fetchExerciseEntryDistanceSeries
>;
const mockZones = fetchWorkoutHrZones as jest.MockedFunction<
  typeof fetchWorkoutHrZones
>;
const mockEntry = fetchExerciseEntry as jest.MockedFunction<
  typeof fetchExerciseEntry
>;
const mockSamples = fetchHeartRateSamples as jest.MockedFunction<
  typeof fetchHeartRateSamples
>;

const gpsRow = (points: object[]) =>
  ({ points }) as unknown as Awaited<ReturnType<typeof fetchWorkoutGpsPoints>>;

describe('useCardioSessionDetail', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    mockZones.mockResolvedValue([]);
  });

  afterEach(() => queryClient.clear());

  test('uses heart rate recorded on the route', async () => {
    mockGps.mockResolvedValue(
      gpsRow([
        { t: '2026-09-20T12:00:00Z', lat: 1, lon: 1, hr: 120 },
        { t: '2026-09-20T12:01:00Z', lat: 1, lon: 1.001, hr: 130 },
      ])
    );
    const { result } = renderHook(
      () => useCardioSessionDetail('run-1', '2026-09-20'),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.heartRate).toHaveLength(2));
    expect(result.current.route).toHaveLength(2);
    expect(mockSamples).not.toHaveBeenCalled();
  });

  test.each([
    ['an indoor session', () => mockGps.mockResolvedValue(null)],
    [
      'a route that fails to load',
      () => mockGps.mockRejectedValue(new Error('network')),
    ],
  ])('falls back to stored samples for %s', async (_label, arrangeGps) => {
    arrangeGps();
    mockEntry.mockResolvedValue({
      id: 'bike-1',
      entry_date: '2026-09-20',
      entry_time: '12:00',
      record_timezone: 'UTC',
      duration_minutes: 30,
    } as Awaited<ReturnType<typeof fetchExerciseEntry>>);
    mockSamples.mockResolvedValue([
      {
        metric: 'heart_rate',
        samples: [
          { t: '2026-09-20T12:05:00Z', bpm: 140 },
          { t: '2026-09-20T14:00:00Z', bpm: 70 },
        ],
      } as unknown as HealthMetricSamples,
    ]);

    const { result } = renderHook(
      () => useCardioSessionDetail('bike-1', '2026-09-20'),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.heartRate).toHaveLength(1));
    expect(result.current.heartRate[0]?.bpm).toBe(140);
    expect(result.current.route).toHaveLength(0);
    expect(mockSamples).toHaveBeenCalledWith('2026-09-20', '2026-09-21');
  });

  test('an indoor session with no route reads its distance series', async () => {
    mockGps.mockResolvedValue(null);
    mockSeries.mockResolvedValue([
      [0, 0],
      [30, 90],
    ]);
    mockEntry.mockResolvedValue(undefined as never);
    mockSamples.mockResolvedValue([] as never);
    const { result } = renderHook(
      () => useCardioSessionDetail('run-1', '2026-09-20'),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.distanceSeries).toHaveLength(2));
  });

  test('a session with a route does not ask for a series', async () => {
    mockGps.mockResolvedValue(
      gpsRow([
        { t: '2026-09-20T12:00:00Z', lat: 1, lon: 1, hr: 120 },
        { t: '2026-09-20T12:01:00Z', lat: 1, lon: 1.001, hr: 130 },
      ])
    );
    const { result } = renderHook(
      () => useCardioSessionDetail('run-1', '2026-09-20'),
      { wrapper: createQueryWrapper(queryClient) }
    );
    await waitFor(() => expect(result.current.route).toHaveLength(2));
    expect(mockSeries).not.toHaveBeenCalled();
  });
});
