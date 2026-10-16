import { averageHeartRate, buildRunSummary } from '../../src/utils/runSummary';
import type { RecordedPoint } from '../../src/utils/gpsRecording';

const DEG = 1 / 111_194.9;
// 2.5 km at 4 m/s, a fix every 62.5 s.
const track: RecordedPoint[] = Array.from({ length: 41 }, (_, i) => ({
  t: 1_000_000 + i * 15_000,
  lat: 51.5 + i * 60 * DEG,
  lon: -0.12,
  alt: null,
  hacc: 5,
  vacc: null,
  speed: null,
  course: null,
  seg: 0,
}));

const build = (overrides = {}) =>
  buildRunSummary({
    activity: 'run',
    entryDate: '2026-10-12',
    distanceUnit: 'km',
    points: track,
    lapMarks: undefined,
    avgHeartRate: null,
    program: null,
    ...overrides,
  });

test('carries the figures, splits and a thinned route', () => {
  const summary = build();
  expect(summary.distanceMeters).toBeGreaterThan(2300);
  expect(summary.activeSeconds).toBeGreaterThan(550);
  expect(summary.splits.map((s) => s.index)).toEqual([1, 2, 3]);
  expect(summary.splits[2].partial).toBe(true);
  expect(summary.laps).toEqual([]);
  // Only what the map needs, no extra fields.
  expect(Object.keys(summary.route[0]).sort()).toEqual(['lat', 'lon', 't']);
});

test('keeps at most 250 route points for a long recording', () => {
  const long = Array.from({ length: 3000 }, (_, i) => ({
    ...track[0],
    t: 1_000_000 + i * 1000,
    lat: 51.5 + i * 3 * DEG,
  }));
  const summary = build({ points: long });
  expect(summary.route.length).toBeLessThanOrEqual(251);
  expect(summary.route.length).toBeGreaterThan(100);
});

test('cuts laps from the marks the person pressed', () => {
  const summary = build({ lapMarks: [1_000_000 + 200_000] });
  expect(summary.laps).toHaveLength(2);
});

test('has no route for a recording of one fix', () => {
  expect(build({ points: [track[0]] }).route).toEqual([]);
});

test('averages heart rate readings and has none without them', () => {
  expect(averageHeartRate([{ bpm: 140 }, { bpm: 151 }])).toBe(146);
  expect(averageHeartRate([])).toBeNull();
});
