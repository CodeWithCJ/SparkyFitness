import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  FORM_GIVE_UP_AFTER_MS,
  FORM_RETRY_AFTER_MS,
  FORM_SWEEP_EVERY_MS,
  rememberPendingWatchForm,
  retryPendingWatchForms,
  sweepRecentRunsMissingForm,
  updatePendingWatchFormDistance,
} from '../../src/services/pendingWatchForm';
import { fetchCardioSessionsPage } from '../../src/services/api/exerciseStatsApi';
import { ApiError } from '../../src/services/api/errors';
import { setExerciseEntryForm } from '../../src/services/api/exerciseApi';
import { measureWatchRunForm } from '../../src/services/stepDistance';
import { learnStride } from '../../src/services/strideCalibration';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/api/exerciseApi', () => ({
  setExerciseEntryForm: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/api/exerciseStatsApi', () => ({
  fetchCardioSessionsPage: jest.fn(),
}));
jest.mock('../../src/services/stepDistance', () => ({
  measureWatchRunForm: jest.fn(),
}));
jest.mock('../../src/services/strideCalibration', () => ({
  learnStride: jest.fn(() => Promise.resolve(true)),
}));

const KEY = '@SparkyFitness/pendingWatchForm';
const T0 = Date.UTC(2026, 10, 2, 11, 0, 0);
const run = {
  entryId: 'entry-1',
  ownerId: 'server-1',
  activity: 'run' as const,
  startedAt: T0 - 30 * 60_000,
  endedAt: T0,
  activeSeconds: 1687,
  distanceMeters: 2897,
  taughtDistance: false,
};
const form = { avgCadence: 124, strideLengthCm: 83.1, steps: 3487 };

const stored = async () =>
  JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.mocked(measureWatchRunForm).mockResolvedValue(form);
});

it('keeps a run once, however often it is remembered', async () => {
  await rememberPendingWatchForm(run, T0);
  await rememberPendingWatchForm(run, T0);
  expect(await stored()).toHaveLength(1);
});

it('waits before looking again', async () => {
  await rememberPendingWatchForm(run, T0);
  expect(await retryPendingWatchForms('server-1', T0 + 60_000)).toEqual([]);
  expect(measureWatchRunForm).not.toHaveBeenCalled();
});

it('fills in cadence and stride once the steps are there, and forgets the run', async () => {
  await rememberPendingWatchForm(run, T0);

  const days = await retryPendingWatchForms(
    'server-1',
    T0 + FORM_RETRY_AFTER_MS
  );

  expect(setExerciseEntryForm).toHaveBeenCalledWith('entry-1', {
    avgCadence: 124,
    strideLengthCm: 83.1,
  });
  expect(days).toHaveLength(1);
  expect(await stored()).toEqual([]);
  expect(learnStride).not.toHaveBeenCalled();
});

it('teaches the stride too when a treadmill distance was entered', async () => {
  await rememberPendingWatchForm({ ...run, taughtDistance: true }, T0);

  await retryPendingWatchForms('server-1', T0 + FORM_RETRY_AFTER_MS);

  expect(learnStride).toHaveBeenCalledWith('run', 3487, 2897, 'entry-1');
});

it('keeps the run and tries later while Apple Health has no steps', async () => {
  jest.mocked(measureWatchRunForm).mockResolvedValue(null);
  await rememberPendingWatchForm(run, T0);

  const now = T0 + FORM_RETRY_AFTER_MS;
  expect(await retryPendingWatchForms('server-1', now)).toEqual([]);

  expect(setExerciseEntryForm).not.toHaveBeenCalled();
  const [kept] = await stored();
  expect(kept.nextAttemptAt).toBe(now + FORM_RETRY_AFTER_MS);
});

it('keeps the run when the server cannot be reached', async () => {
  jest
    .mocked(setExerciseEntryForm)
    .mockRejectedValueOnce(new ApiError('offline', 503));
  await rememberPendingWatchForm(run, T0);

  expect(
    await retryPendingWatchForms('server-1', T0 + FORM_RETRY_AFTER_MS)
  ).toEqual([]);
  expect(await stored()).toHaveLength(1);
});

it('drops a run whose entry is gone', async () => {
  jest
    .mocked(setExerciseEntryForm)
    .mockRejectedValueOnce(new ApiError('gone', 404));
  await rememberPendingWatchForm(run, T0);

  await retryPendingWatchForms('server-1', T0 + FORM_RETRY_AFTER_MS);

  expect(await stored()).toEqual([]);
});

it('leaves another server’s runs alone', async () => {
  await rememberPendingWatchForm(run, T0);

  await retryPendingWatchForms('server-2', T0 + FORM_RETRY_AFTER_MS);

  expect(measureWatchRunForm).not.toHaveBeenCalled();
  expect(await stored()).toHaveLength(1);
});

it('gives up on a run the steps never came for', async () => {
  await rememberPendingWatchForm(run, T0);

  await retryPendingWatchForms('server-1', T0 + FORM_GIVE_UP_AFTER_MS + 1);

  expect(measureWatchRunForm).not.toHaveBeenCalled();
  expect(await stored()).toEqual([]);
});

it('measures from a distance corrected while the run waits, and learns from it', async () => {
  await rememberPendingWatchForm(run, T0);
  await updatePendingWatchFormDistance('entry-1', 3218);

  await retryPendingWatchForms('server-1', T0 + FORM_RETRY_AFTER_MS);

  expect(measureWatchRunForm).toHaveBeenCalledWith(
    expect.objectContaining({ activity: 'run' }),
    3218
  );
  expect(learnStride).toHaveBeenCalledWith('run', 3487, 3218, 'entry-1');
});

it('leaves the list alone when the corrected run is not waiting', async () => {
  await rememberPendingWatchForm(run, T0);
  await updatePendingWatchFormDistance('entry-2', 3218);
  expect(await stored()).toEqual([
    expect.objectContaining({ entryId: 'entry-1', distanceMeters: 2897 }),
  ]);
});

describe('sweeping for runs without a cadence', () => {
  const NOW = new Date(2026, 10, 3, 19, 0, 0).getTime();
  const item = (over: Record<string, unknown> = {}) => ({
    id: 'entry-1',
    exerciseName: 'Running',
    entryDate: '2026-11-02',
    entryTime: '06:22:00',
    durationMinutes: 28.12,
    movingDurationMinutes: null,
    distanceMeters: 2897,
    avgCadence: null,
    source: 'Manual',
    ...over,
  });
  const serve = (...items: Record<string, unknown>[]) =>
    jest
      .mocked(fetchCardioSessionsPage)
      .mockResolvedValue({ items, page: 1, totalPages: 1 } as never);

  it('queues a recent run with no cadence and measures it at once', async () => {
    serve(item());

    await sweepRecentRunsMissingForm('server-1', NOW);
    const days = await retryPendingWatchForms('server-1', NOW);

    expect(measureWatchRunForm).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: 'run',
        startedAt: new Date(2026, 10, 2, 6, 22, 0).getTime(),
        activeSeconds: 1687,
      }),
      2897
    );
    expect(setExerciseEntryForm).toHaveBeenCalledWith('entry-1', {
      avgCadence: 124,
      strideLengthCm: 83.1,
    });
    expect(days).toEqual(['2026-11-02']);
  });

  it('leaves out runs that have a cadence, other sources, strength and tiny entries', async () => {
    serve(
      item({ id: 'a', avgCadence: 120 }),
      item({ id: 'b', source: 'HealthKit' }),
      item({ id: 'c', exerciseName: 'Chest Press' }),
      item({ id: 'd', distanceMeters: 40 }),
      item({ id: 'e', durationMinutes: 2 })
    );

    await sweepRecentRunsMissingForm('server-1', NOW);

    expect(await stored()).toEqual([]);
  });

  it('does not take a run again once it was filled in', async () => {
    serve(item());
    await sweepRecentRunsMissingForm('server-1', NOW);
    await retryPendingWatchForms('server-1', NOW);
    jest.mocked(measureWatchRunForm).mockClear();

    await sweepRecentRunsMissingForm('server-1', NOW + FORM_SWEEP_EVERY_MS + 1);

    expect(await stored()).toEqual([]);
  });

  it('asks the server only now and then', async () => {
    serve();
    await sweepRecentRunsMissingForm('server-1', NOW);
    await sweepRecentRunsMissingForm('server-1', NOW + 60_000);
    expect(fetchCardioSessionsPage).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a server, and survives one that fails', async () => {
    await sweepRecentRunsMissingForm(null, NOW);
    expect(fetchCardioSessionsPage).not.toHaveBeenCalled();

    jest
      .mocked(fetchCardioSessionsPage)
      .mockRejectedValue(new Error('offline'));
    await expect(
      sweepRecentRunsMissingForm('server-1', NOW)
    ).resolves.toBeUndefined();
  });
});
