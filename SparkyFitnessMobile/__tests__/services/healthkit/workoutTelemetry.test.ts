import { queryQuantitySamples } from '@kingstinct/react-native-healthkit';
import * as telemetryDownsample from '../../../src/services/shared/telemetryDownsample';
import {
  collectWorkoutRoute,
  collectWorkoutSeries,
  collectWorkoutLaps,
  collectWorkoutTelemetry,
  type WorkoutProxyLike,
} from '../../../src/services/healthkit/workoutTelemetry';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockQueryQuantitySamples = queryQuantitySamples as jest.Mock;

const at = (offsetMs: number): string =>
  new Date(Date.parse('2026-08-05T09:00:00.000Z') + offsetMs).toISOString();

const workoutWithRoutes = (
  routes: readonly { locations?: unknown[] }[]
): WorkoutProxyLike => ({
  getWorkoutRoutes: jest.fn().mockResolvedValue(routes),
});

beforeEach(() => {
  jest.clearAllMocks();
});

// -----------------------------------------------------------------------
// collectWorkoutRoute
// -----------------------------------------------------------------------
describe('collectWorkoutRoute', () => {
  it('maps a single route into WorkoutGpsPoint[]', async () => {
    const workout = workoutWithRoutes([
      {
        locations: [
          {
            date: at(0),
            latitude: 37.7749,
            longitude: -122.4194,
            altitude: 15,
            speed: 1.2,
            course: 90,
            distance: 10,
            horizontalAccuracy: 5,
            verticalAccuracy: 4,
          },
        ],
      },
    ]);

    const points = await collectWorkoutRoute(workout);

    expect(points).toEqual([
      {
        t: at(0),
        lat: 37.7749,
        lon: -122.4194,
        alt: 15,
        speed: 1.2,
        course: 90,
        dist: 10,
        hacc: 5,
        vacc: 4,
      },
    ]);
  });

  it('flattens multiple route objects (a watch splits long activities) and sorts by time', async () => {
    const workout = workoutWithRoutes([
      { locations: [{ date: at(2000), latitude: 1, longitude: 2 }] },
      { locations: [{ date: at(0), latitude: 3, longitude: 4 }] },
    ]);

    const points = await collectWorkoutRoute(workout);

    expect(points.map((p) => p.t)).toEqual([at(0), at(2000)]);
  });

  it('drops points with a non-finite lat/lon or an unparseable date', async () => {
    const workout = workoutWithRoutes([
      {
        locations: [
          { date: at(0), latitude: NaN, longitude: 2 },
          { date: at(1000), latitude: 1, longitude: Infinity },
          { date: 'not-a-date', latitude: 1, longitude: 2 },
          { date: at(2000), latitude: 1, longitude: 2 },
        ],
      },
    ]);

    const points = await collectWorkoutRoute(workout);

    expect(points).toHaveLength(1);
    expect(points[0].t).toBe(at(2000));
  });

  it('maps CoreLocation\'s -1 sentinel (no fix) for speed/course to null, not -1', async () => {
    const workout = workoutWithRoutes([
      {
        locations: [
          { date: at(0), latitude: 1, longitude: 2, speed: -1, course: -1 },
        ],
      },
    ]);

    const points = await collectWorkoutRoute(workout);

    expect(points[0].speed).toBeNull();
    expect(points[0].course).toBeNull();
  });

  it('does not apply the -1 sentinel rule to altitude/distance/accuracy — negative-but-finite values pass through', async () => {
    // altitude/distance/accuracy use finiteOrNull, not validOrNull: HealthKit
    // can legitimately report a negative altitude (below sea level), unlike
    // speed/course where -1 specifically means "no fix".
    const workout = workoutWithRoutes([
      {
        locations: [
          {
            date: at(0),
            latitude: 1,
            longitude: 2,
            altitude: -5,
            horizontalAccuracy: -1,
          },
        ],
      },
    ]);

    const points = await collectWorkoutRoute(workout);

    expect(points[0].alt).toBe(-5);
    expect(points[0].hacc).toBe(-1);
  });

  it('returns [] when getWorkoutRoutes rejects (no route access, or an indoor workout)', async () => {
    const workout: WorkoutProxyLike = {
      getWorkoutRoutes: jest.fn().mockRejectedValue(new Error('no route')),
    };

    await expect(collectWorkoutRoute(workout)).resolves.toEqual([]);
  });

  it('returns [] for a workout with no locations at all', async () => {
    const workout = workoutWithRoutes([]);
    await expect(collectWorkoutRoute(workout)).resolves.toEqual([]);
  });
});

// -----------------------------------------------------------------------
// collectWorkoutSeries
// -----------------------------------------------------------------------
describe('collectWorkoutSeries', () => {
  it('queries every series spec with the workout filter and its pinned unit', async () => {
    mockQueryQuantitySamples.mockResolvedValue([]);
    const workout: WorkoutProxyLike = { getWorkoutRoutes: jest.fn() };

    await collectWorkoutSeries(workout);

    expect(mockQueryQuantitySamples).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierHeartRate',
      expect.objectContaining({ unit: 'count/min', filter: { workout } })
    );
    expect(mockQueryQuantitySamples).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierRunningSpeed',
      expect.objectContaining({ unit: 'm/s' })
    );
  });

  it('merges Running and Cycling variants of the same metric onto one key', async () => {
    mockQueryQuantitySamples.mockImplementation((identifier: string) => {
      if (identifier === 'HKQuantityTypeIdentifierRunningSpeed') {
        return Promise.resolve([{ startDate: at(0), quantity: 3 }]);
      }
      if (identifier === 'HKQuantityTypeIdentifierCyclingSpeed') {
        return Promise.resolve([{ startDate: at(1000), quantity: 5 }]);
      }
      return Promise.resolve([]);
    });
    const workout: WorkoutProxyLike = { getWorkoutRoutes: jest.fn() };

    const { series } = await collectWorkoutSeries(workout);

    // A single activity only ever produces one of the two — this proves both
    // land under the shared 'speed' key regardless of which one fired.
    expect(series.speed).toEqual([
      { t: at(0), v: 3 },
      { t: at(1000), v: 5 },
    ]);
  });

  it('drops samples with a non-finite quantity or unparseable date', async () => {
    mockQueryQuantitySamples.mockImplementation((identifier: string) => {
      if (identifier === 'HKQuantityTypeIdentifierHeartRate') {
        return Promise.resolve([
          { startDate: at(0), quantity: 120 },
          { startDate: at(1000), quantity: NaN },
          { startDate: 'garbage', quantity: 100 },
        ]);
      }
      return Promise.resolve([]);
    });
    const workout: WorkoutProxyLike = { getWorkoutRoutes: jest.fn() };

    const { series } = await collectWorkoutSeries(workout);

    expect(series.hr).toEqual([{ t: at(0), v: 120 }]);
  });

  it('one series type failing (unauthorized, unavailable) does not lose the rest', async () => {
    mockQueryQuantitySamples.mockImplementation((identifier: string) => {
      if (identifier === 'HKQuantityTypeIdentifierHeartRate') {
        return Promise.reject(new Error('not authorized'));
      }
      if (identifier === 'HKQuantityTypeIdentifierRunningSpeed') {
        return Promise.resolve([{ startDate: at(0), quantity: 2.5 }]);
      }
      return Promise.resolve([]);
    });
    const workout: WorkoutProxyLike = { getWorkoutRoutes: jest.fn() };

    const { series } = await collectWorkoutSeries(workout);

    expect(series.hr).toBeUndefined();
    expect(series.speed).toEqual([{ t: at(0), v: 2.5 }]);
  });

  it('omits the key entirely for a type with no samples, rather than an empty array', async () => {
    mockQueryQuantitySamples.mockResolvedValue([]);
    const workout: WorkoutProxyLike = { getWorkoutRoutes: jest.fn() };

    const { series } = await collectWorkoutSeries(workout);

    expect(Object.keys(series)).toEqual([]);
  });

  it('sorts each series ascending by time', async () => {
    mockQueryQuantitySamples.mockImplementation((identifier: string) => {
      if (identifier === 'HKQuantityTypeIdentifierHeartRate') {
        return Promise.resolve([
          { startDate: at(2000), quantity: 130 },
          { startDate: at(0), quantity: 110 },
        ]);
      }
      return Promise.resolve([]);
    });
    const workout: WorkoutProxyLike = { getWorkoutRoutes: jest.fn() };

    const { series } = await collectWorkoutSeries(workout);

    expect(series.hr?.map((p) => p.t)).toEqual([at(0), at(2000)]);
  });
});

// -----------------------------------------------------------------------
// collectWorkoutLaps
// -----------------------------------------------------------------------
describe('collectWorkoutLaps', () => {
  it('keeps only lap (3) and segment (7) events, dropping pause/resume', () => {
    const laps = collectWorkoutLaps([
      { type: 3, startDate: at(0), endDate: at(1000) },
      { type: 1 /* pause */, startDate: at(1000), endDate: at(1500) },
      { type: 7, startDate: at(1500), endDate: at(2500) },
    ]);

    expect(laps).toHaveLength(2);
  });

  it('sorts by start time and assigns a dense 1-based lap_index', () => {
    const laps = collectWorkoutLaps([
      { type: 3, startDate: at(2000), endDate: at(3000) },
      { type: 3, startDate: at(0), endDate: at(1000) },
    ]);

    expect(laps).toEqual([
      { start_time: at(0), end_time: at(1000), lap_index: 1 },
      { start_time: at(2000), end_time: at(3000), lap_index: 2 },
    ]);
  });

  it('drops events with an unparseable start or end date', () => {
    const laps = collectWorkoutLaps([
      { type: 3, startDate: 'bad', endDate: at(1000) },
      { type: 3, startDate: at(0), endDate: at(1000) },
    ]);

    expect(laps).toHaveLength(1);
  });

  it('returns [] for undefined or empty events', () => {
    expect(collectWorkoutLaps(undefined)).toEqual([]);
    expect(collectWorkoutLaps([])).toEqual([]);
  });

  it('drops instantaneous marker events (start == end)', () => {
    // .lap events are often zero-width markers; the server derives lap stats
    // from the window, and a zero-width window contains no samples.
    const laps = collectWorkoutLaps([
      { type: 3, startDate: at(0), endDate: at(0) },
      { type: 3, startDate: at(0), endDate: at(1000) },
      { type: 3, startDate: at(1000), endDate: at(1000) },
    ]);

    expect(laps).toEqual([
      { start_time: at(0), end_time: at(1000), lap_index: 1 },
    ]);
  });
});

// -----------------------------------------------------------------------
// collectWorkoutTelemetry (integration)
// -----------------------------------------------------------------------
describe('collectWorkoutTelemetry', () => {
  it('returns {} for a workout with no route, no series, and no lap events', async () => {
    mockQueryQuantitySamples.mockResolvedValue([]);
    const workout = workoutWithRoutes([]);

    const bundle = await collectWorkoutTelemetry(workout, []);

    expect(bundle).toEqual({});
  });

  it('an HR-only indoor workout gets hr_samples and summary telemetry, no gps_points', async () => {
    mockQueryQuantitySamples.mockImplementation((identifier: string) => {
      if (identifier === 'HKQuantityTypeIdentifierHeartRate') {
        return Promise.resolve([
          { startDate: at(0), quantity: 100 },
          { startDate: at(1000), quantity: 140 },
        ]);
      }
      return Promise.resolve([]);
    });
    const workout = workoutWithRoutes([]); // indoor: no route

    const bundle = await collectWorkoutTelemetry(workout, []);

    expect(bundle.gps_points).toBeUndefined();
    expect(bundle.hr_samples).toEqual([
      { t: at(0), bpm: 100 },
      { t: at(1000), bpm: 140 },
    ]);
    expect(bundle.telemetry?.avg_heart_rate).toBe(120);
    expect(bundle.telemetry?.max_heart_rate).toBe(140);
  });

  it('an outdoor workout with a route but no HR gets gps_points and no avg_heart_rate', async () => {
    mockQueryQuantitySamples.mockResolvedValue([]);
    const workout = workoutWithRoutes([
      { locations: [{ date: at(0), latitude: 1, longitude: 2 }] },
    ]);

    const bundle = await collectWorkoutTelemetry(workout, []);

    expect(bundle.gps_points).toHaveLength(1);
    expect(bundle.hr_samples).toBeUndefined();
    expect(bundle.telemetry?.avg_heart_rate).toBeUndefined();
  });

  it('includes laps built from the passed workout events', async () => {
    mockQueryQuantitySamples.mockResolvedValue([]);
    const workout = workoutWithRoutes([]);

    const bundle = await collectWorkoutTelemetry(workout, [
      { type: 3, startDate: at(0), endDate: at(1000) },
    ]);

    expect(bundle.laps).toEqual([
      { start_time: at(0), end_time: at(1000), lap_index: 1 },
    ]);
  });

  it('is additive, not required: an unexpected failure anywhere is reported, not thrown', async () => {
    // Simulates a bug in a downstream helper — proves the outer try/catch in
    // collectWorkoutTelemetry protects the whole workout sync, not just the
    // per-series/per-route reads that already guard themselves internally.
    //
    // It reports `incomplete` rather than an empty bundle: an empty bundle is
    // the answer for a workout that genuinely has nothing beyond its summary,
    // and the caller caches that so it is not re-read every sync. A failure
    // must not be cached — the reuse cache has no expiry, so it would strand
    // this workout's telemetry permanently.
    const spy = jest
      .spyOn(telemetryDownsample, 'downsampleGpsPoints')
      .mockImplementation(() => {
        throw new Error('boom');
      });
    mockQueryQuantitySamples.mockResolvedValue([]);
    const workout = workoutWithRoutes([
      { locations: [{ date: at(0), latitude: 1, longitude: 2 }] },
    ]);

    await expect(collectWorkoutTelemetry(workout, [])).resolves.toEqual({
      incomplete: true,
    });

    spy.mockRestore();
  });

  it('a generic series read rejection is reported, not cached as empty', async () => {
    // HealthKit returns [] when there are simply no samples, so a rejection is
    // never "no data". An unclassified failure must not be recorded as
    // collected — the reuse cache has no expiry.
    mockQueryQuantitySamples.mockRejectedValue(new Error('HKErrorDomain error 6'));

    await expect(
      collectWorkoutTelemetry(workoutWithRoutes([]), []),
    ).resolves.toEqual({ incomplete: true });
  });

  it('an explicitly unauthorized series type is stable and stays cacheable', async () => {
    mockQueryQuantitySamples.mockRejectedValue(
      new Error('Authorization not determined'),
    );

    await expect(
      collectWorkoutTelemetry(workoutWithRoutes([]), []),
    ).resolves.toEqual({});
  });

  it('an indoor workout with no route is NOT incomplete', async () => {
    // getWorkoutRoutes throws for every indoor activity. Treating that as
    // incomplete would keep indoor workouts out of the reuse cache forever and
    // churn the per-run telemetry budget on them (#2191).
    mockQueryQuantitySamples.mockResolvedValue([]);
    const workout: WorkoutProxyLike = {
      getWorkoutRoutes: jest.fn().mockRejectedValue(new Error('no route')),
    };

    await expect(collectWorkoutTelemetry(workout, [])).resolves.toEqual({});
  });

  it('a workout with genuinely nothing to collect returns an empty bundle', async () => {
    // The distinction the reuse cache keys on: nothing found is a stable
    // answer worth caching, a failed read is not.
    mockQueryQuantitySamples.mockResolvedValue([]);

    await expect(
      collectWorkoutTelemetry(workoutWithRoutes([]), []),
    ).resolves.toEqual({});
  });
});
