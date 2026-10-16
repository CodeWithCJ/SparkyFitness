import { watchRunSummary } from '../../src/utils/watchRunSummary';
import type { WatchRunPayload } from '../../src/utils/watchRun';

const T0 = new Date(2026, 9, 10, 8, 0).getTime();
const DEG = 1 / 111_194.9;

const outdoor: WatchRunPayload = {
  clientId: 'x',
  kind: 'run',
  place: 'outdoor',
  startedAt: T0,
  endedAt: T0 + 700_000,
  activeSeconds: 650,
  distanceMeters: 2600,
  activeEnergyKcal: 180,
  route: Array.from({ length: 41 }, (_, i) => [
    T0 + i * 15_000,
    51.5 + i * 60 * DEG,
    -0.12,
    10 + i * 0.5,
    5,
    0,
  ]),
  heartRate: [
    [T0, 140],
    [T0 + 60_000, 150],
  ],
  laps: [],
  lapDistances: [],
  distanceSeries: [],
  planId: null,
  program: null,
  planCompleted: false,
};

test("uses the watch's own distance and time, with splits from the route", () => {
  const summary = watchRunSummary(outdoor, 'km', null);
  expect(summary.activity).toBe('run');
  expect(summary.entryDate).toBe('2026-10-10');
  expect(summary.distanceMeters).toBe(2600);
  expect(summary.activeSeconds).toBe(650);
  expect(summary.avgHeartRate).toBe(145);
  expect(summary.splits.length).toBeGreaterThan(0);
  expect(summary.route.length).toBeGreaterThan(1);
  expect(summary.elevationGainMeters).toBeGreaterThan(0);
});

test('cuts an outdoor route at the laps the wearer marked', () => {
  const summary = watchRunSummary(
    { ...outdoor, laps: [T0 + 300_000] },
    'km',
    null
  );
  expect(summary.laps).toHaveLength(2);
});

test('an indoor run has no route; its laps come from the watch marks and distances', () => {
  const summary = watchRunSummary(
    {
      ...outdoor,
      place: 'indoor',
      route: [],
      distanceMeters: 2000,
      laps: [T0 + 300_000],
      lapDistances: [900],
      distanceSeries: [],
    },
    'km',
    null
  );
  expect(summary.route).toEqual([]);
  expect(summary.splits).toEqual([]);
  expect(summary.laps.map((l) => l.distanceMeters)).toEqual([900, 1100]);
  expect(summary.laps.map((l) => l.durationSeconds)).toEqual([300, 400]);
  expect(summary.distanceMeters).toBe(2000);
});

test('passes the program progress through', () => {
  const program = {
    nextLine: 'Next: x',
    done: 2,
    total: 9,
    finished: false,
  };
  expect(watchRunSummary(outdoor, 'km', program).program).toEqual(program);
});

test('lets the person correct the distance of a treadmill run once it is filed', () => {
  const indoor = { ...outdoor, place: 'indoor' as const, route: [] };
  expect(watchRunSummary(indoor, 'km', null, 'entry-1').editableDistance).toBe(
    true
  );
  // Not filed yet, or outdoors where the route gives the distance.
  expect(watchRunSummary(indoor, 'km', null).editableDistance).toBe(false);
  expect(watchRunSummary(outdoor, 'km', null, 'entry-1').editableDistance).toBe(
    false
  );
});

test('an indoor run carries its distance series for the pace chart', () => {
  const series = [
    [0, 0],
    [30, 80],
    [60, 160],
  ];
  const summary = watchRunSummary(
    { ...outdoor, place: 'indoor', route: [], distanceSeries: series },
    'km',
    null
  );
  expect(summary.distanceSeries).toEqual(series);
  expect(
    watchRunSummary({ ...outdoor, distanceSeries: series }, 'km', null)
      .distanceSeries
  ).toBeUndefined();
});
