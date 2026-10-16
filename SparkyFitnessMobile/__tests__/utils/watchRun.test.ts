import {
  indoorLapWindows,
  parseWatchRunPayload,
  watchRunPoints,
  WATCH_NO_ALTITUDE,
} from '../../src/utils/watchRun';

const base = {
  clientId: 'abc',
  kind: 'walk',
  place: 'outdoor',
  startedAt: 1_000,
  endedAt: 2_000_000,
  activeSeconds: 1800,
  distanceMeters: 2500,
  activeEnergyKcal: 120,
  route: [
    [2000, 51.5, -0.12, WATCH_NO_ALTITUDE, 5, 0],
    [1000, 51.501, -0.12, 12, -1, 0],
    [3000, 'bad'],
  ],
  heartRate: [[1000, 110], [2000]],
};

describe('parseWatchRunPayload', () => {
  test('reads the indoor factor and the pre-correction distance', () => {
    const parsed = parseWatchRunPayload({
      ...base,
      distanceScale: 1.1,
      estimatedDistanceMeters: 2200,
    });
    expect(parsed?.distanceScale).toBe(1.1);
    expect(parsed?.estimatedDistanceMeters).toBe(2200);
    const plain = parseWatchRunPayload({ ...base, distanceScale: 'x' });
    expect(plain?.distanceScale).toBeUndefined();
    expect(plain?.estimatedDistanceMeters).toBeUndefined();
  });

  test('keeps good rows and drops malformed ones', () => {
    const parsed = parseWatchRunPayload(base);
    expect(parsed?.route).toHaveLength(2);
    expect(parsed?.heartRate).toEqual([[1000, 110]]);
  });

  test('keeps lap marks in order and drops junk', () => {
    expect(
      parseWatchRunPayload({ ...base, laps: [3000, 'x', 1000] })?.laps
    ).toEqual([1000, 3000]);
    expect(parseWatchRunPayload(base)?.laps).toEqual([]);
  });

  test('reads the plan the run followed', () => {
    expect(
      parseWatchRunPayload({
        ...base,
        planId: 'beginner5k',
        programId: 'beginner5k',
        programIndex: 2,
        planCompleted: true,
      })
    ).toMatchObject({
      planId: 'beginner5k',
      program: { id: 'beginner5k', index: 2 },
      planCompleted: true,
    });
    // The phone module sends -1 and "" for "none".
    expect(
      parseWatchRunPayload({
        ...base,
        planId: 'runWalk2',
        programId: '',
        programIndex: -1,
      })
    ).toMatchObject({
      planId: 'runWalk2',
      program: null,
      planCompleted: false,
    });
  });

  test.each([
    [null],
    [{ ...base, clientId: '' }],
    [{ ...base, kind: 'ride' }],
    [{ ...base, place: 'pool' }],
    [{ ...base, endedAt: 1 }],
  ])('rejects an unusable payload %#', (raw) => {
    expect(parseWatchRunPayload(raw)).toBeNull();
  });

  test('defaults missing figures to zero', () => {
    const parsed = parseWatchRunPayload({
      ...base,
      activeSeconds: undefined,
      distanceMeters: -4,
      route: undefined,
    });
    expect(parsed?.activeSeconds).toBe(0);
    expect(parsed?.distanceMeters).toBe(0);
    expect(parsed?.route).toEqual([]);
  });
});

describe('watchRunPoints', () => {
  test('sorts by time and maps the sentinels to null', () => {
    const points = watchRunPoints(parseWatchRunPayload(base)!);
    expect(points.map((p) => p.t)).toEqual([1000, 2000]);
    expect(points[0].alt).toBe(12);
    expect(points[0].hacc).toBeNull();
    expect(points[1].alt).toBeNull();
    expect(points[1].hacc).toBe(5);
  });
});

describe('indoorLapWindows', () => {
  const run = (overrides = {}) => ({
    ...(parseWatchRunPayload({ ...base, route: [] }) as NonNullable<
      ReturnType<typeof parseWatchRunPayload>
    >),
    startedAt: 0,
    endedAt: 600_000,
    distanceMeters: 2000,
    heartRate: [
      [100_000, 140],
      [200_000, 150],
      [400_000, 170],
    ],
    ...overrides,
  });

  test('cuts the run at the marks, taking distance and heart rate from the watch', () => {
    const laps = indoorLapWindows(
      run({ laps: [300_000], lapDistances: [900] })
    );
    expect(laps).toEqual([
      {
        lap_index: 1,
        start_time: new Date(0).toISOString(),
        end_time: new Date(300_000).toISOString(),
        distance_meters: 900,
        avg_heart_rate: 145,
      },
      {
        lap_index: 2,
        start_time: new Date(300_000).toISOString(),
        end_time: new Date(600_000).toISOString(),
        distance_meters: 1100,
        avg_heart_rate: 170,
      },
    ]);
  });

  test('has no laps without marks, and leaves distance out when it was not sent per mark', () => {
    expect(indoorLapWindows(run())).toEqual([]);
    const [first] = indoorLapWindows(run({ laps: [300_000] }));
    expect(first.distance_meters).toBeUndefined();
  });

  test('ignores a mark outside the run', () => {
    expect(
      indoorLapWindows(run({ laps: [900_000], lapDistances: [1] }))
    ).toEqual([]);
  });
});

test('reads the distance series and drops malformed rows', () => {
  const parsed = parseWatchRunPayload({
    ...base,
    distanceSeries: [[0, 0], [10, 25], ['x', 1], [20]],
  });
  expect(parsed?.distanceSeries).toEqual([
    [0, 0],
    [10, 25],
  ]);
});
