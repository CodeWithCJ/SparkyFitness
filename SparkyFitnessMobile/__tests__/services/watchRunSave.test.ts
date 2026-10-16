import {
  attachExerciseEntryDistanceSeries,
  attachExerciseEntryGpsTrack,
  attachExerciseEntryLaps,
  attachExerciseEntryWatchTelemetry,
  createExerciseEntry,
} from '../../src/services/api/exerciseApi';
import { resolveRecordingExercise } from '../../src/services/gpsRecordingSave';
import { saveWatchRun } from '../../src/services/watchRunSave';
import type { WatchRunPayload } from '../../src/utils/watchRun';

jest.mock('../../src/services/api/exerciseApi');
jest.mock('../../src/services/gpsRecordingSave');
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const T0 = new Date(2026, 9, 10, 7, 5).getTime();
const DEG = 1 / 111_194.9;

const outdoor: WatchRunPayload = {
  clientId: 'x',
  kind: 'run',
  place: 'outdoor',
  startedAt: T0,
  endedAt: T0 + 1_000_000,
  activeSeconds: 950,
  distanceMeters: 3000,
  activeEnergyKcal: 210,
  route: Array.from({ length: 11 }, (_, i) => [
    T0 + i * 90_000,
    51.5 + i * 300 * DEG,
    -0.12,
    10,
    5,
    0,
  ]),
  heartRate: [
    [T0, 120],
    [T0 + 60_000, 140],
  ],
  laps: [],
  lapDistances: [],
  distanceSeries: [],
  planId: null,
  program: null,
  planCompleted: false,
};

beforeEach(() => {
  jest.resetAllMocks();
  jest
    .mocked(resolveRecordingExercise)
    .mockResolvedValue({ id: 'ex1', name: 'Running' } as never);
  jest.mocked(createExerciseEntry).mockResolvedValue({ id: 'e1' } as never);
});

test('logs the entry, route and telemetry from the watch figures', async () => {
  const created = jest.fn(() => Promise.resolve());
  const id = await saveWatchRun(outdoor, 'km', undefined, created);

  expect(id).toBe('e1');
  expect(created).toHaveBeenCalledWith('e1');
  expect(createExerciseEntry).toHaveBeenCalledWith(
    expect.objectContaining({
      exercise_id: 'ex1',
      entry_date: '2026-10-10',
      entry_time: '07:05',
      distance: 3,
    })
  );
  expect(attachExerciseEntryGpsTrack).toHaveBeenCalledTimes(1);
  expect(attachExerciseEntryWatchTelemetry).toHaveBeenCalledWith('e1', {
    hrSamples: expect.any(Array),
    activeEnergyKcal: 210,
  });
});

test('an indoor run has no track, and a retry reuses the entry', async () => {
  const indoor = { ...outdoor, place: 'indoor' as const, route: [] };
  await saveWatchRun(indoor, 'km', 'e7', jest.fn());

  expect(createExerciseEntry).not.toHaveBeenCalled();
  expect(attachExerciseEntryGpsTrack).not.toHaveBeenCalled();
  expect(attachExerciseEntryWatchTelemetry).toHaveBeenCalledWith(
    'e7',
    expect.objectContaining({ activeEnergyKcal: 210 })
  );
});

test('a telemetry failure does not fail the save', async () => {
  jest
    .mocked(attachExerciseEntryWatchTelemetry)
    .mockRejectedValueOnce(new Error('boom'));
  await expect(saveWatchRun(outdoor, 'km', undefined, jest.fn())).resolves.toBe(
    'e1'
  );
});

test('cuts the route at the laps the wearer marked', async () => {
  await saveWatchRun(
    { ...outdoor, laps: [T0 + 300_000, T0 + 600_000] },
    'km',
    undefined,
    jest.fn()
  );
  const { laps } = jest.mocked(attachExerciseEntryGpsTrack).mock.calls[0][1];
  // Two marks make three stretches, not one per kilometre.
  expect(laps).toHaveLength(3);
});

test('an indoor run files the laps the wearer marked, with their distances', async () => {
  const indoor = {
    ...outdoor,
    place: 'indoor' as const,
    route: [],
    distanceMeters: 3000,
    laps: [T0 + 300_000, T0 + 600_000],
    lapDistances: [900, 1900],
    distanceSeries: [],
  };
  await saveWatchRun(indoor, 'km', 'e7', jest.fn());
  expect(attachExerciseEntryGpsTrack).not.toHaveBeenCalled();
  const [, laps] = jest.mocked(attachExerciseEntryLaps).mock.calls[0];
  expect(laps.map((l) => l.distance_meters)).toEqual([900, 1000, 1100]);
  expect(laps.map((l) => l.lap_index)).toEqual([1, 2, 3]);
});

test('a failed laps upload does not fail the save', async () => {
  jest.mocked(attachExerciseEntryLaps).mockRejectedValueOnce(new Error('boom'));
  const indoor = {
    ...outdoor,
    place: 'indoor' as const,
    route: [],
    laps: [T0 + 300_000],
    lapDistances: [900],
    distanceSeries: [],
  };
  await expect(saveWatchRun(indoor, 'km', 'e7', jest.fn())).resolves.toBe('e7');
  expect(attachExerciseEntryWatchTelemetry).toHaveBeenCalled();
});

test('an indoor run with no laps attaches none', async () => {
  const indoor = { ...outdoor, place: 'indoor' as const, route: [] };
  await saveWatchRun(indoor, 'km', 'e7', jest.fn());
  expect(attachExerciseEntryLaps).not.toHaveBeenCalled();
});

test('an indoor run files its distance series for the pace chart', async () => {
  const series = [
    [0, 0],
    [10, 28],
    [20, 57],
  ];
  const indoor = {
    ...outdoor,
    place: 'indoor' as const,
    route: [],
    distanceSeries: series,
  };
  await saveWatchRun(indoor, 'km', 'e7', jest.fn());
  expect(attachExerciseEntryDistanceSeries).toHaveBeenCalledWith('e7', series);
});

test('a failed series upload does not fail the save', async () => {
  jest
    .mocked(attachExerciseEntryDistanceSeries)
    .mockRejectedValueOnce(new Error('boom'));
  const indoor = {
    ...outdoor,
    place: 'indoor' as const,
    route: [],
    distanceSeries: [
      [0, 0],
      [10, 28],
    ],
  };
  await expect(saveWatchRun(indoor, 'km', 'e7', jest.fn())).resolves.toBe('e7');
});
