import AsyncStorage from '@react-native-async-storage/async-storage';
import WatchConnectivity from '../../modules/watch-connectivity';
import {
  acceptPendingWatchRuns,
  deleteWatchRunsForConfig,
  enqueueWatchRun,
  hasQueuedWatchRuns,
  onWatchRunRetry,
  processWatchRunQueue,
  receiveWatchRunEffort,
} from '../../src/services/watchRunQueue';
import { saveWatchRun } from '../../src/services/watchRunSave';
import {
  completeProgramWorkout,
  rateProgramWorkout,
} from '../../src/services/runProgramService';
import { setExerciseEntryEffort } from '../../src/services/api/exerciseApi';
import { invalidateExerciseCache } from '../../src/hooks/invalidateExerciseCache';
import { ApiError } from '../../src/services/api/errors';
import type { WatchRunPayload } from '../../src/utils/watchRun';
import { learnWatchIndoorScale } from '../../src/services/watchIndoorScale';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    ackWatchRuns: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../src/services/watchRunSave');
jest.mock('../../src/services/watchIndoorScale', () => ({
  learnWatchIndoorScale: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/runProgramService', () => ({
  completeProgramWorkout: jest.fn(() => Promise.resolve()),
  rateProgramWorkout: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../src/services/api/exerciseApi', () => ({
  setExerciseEntryEffort: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

const mockedSave = jest.mocked(saveWatchRun);

const run = (clientId: string): WatchRunPayload => ({
  clientId,
  kind: 'walk',
  place: 'outdoor',
  startedAt: new Date(2026, 9, 10, 8, 0).getTime(),
  endedAt: new Date(2026, 9, 10, 8, 30).getTime(),
  activeSeconds: 1800,
  distanceMeters: 2000,
  activeEnergyKcal: 100,
  route: [],
  heartRate: [],
  laps: [],
  lapDistances: [],
  distanceSeries: [],
  planId: null,
  program: null,
  planCompleted: false,
});

const ACTIVE_CONFIG_KEY = 'activeServerConfigId';

beforeEach(async () => {
  jest.mocked(completeProgramWorkout).mockClear();
  jest.mocked(rateProgramWorkout).mockClear();
  jest.mocked(invalidateExerciseCache).mockClear();
  jest.mocked(setExerciseEntryEffort).mockReset();
  jest.mocked(setExerciseEntryEffort).mockResolvedValue(undefined);
  jest.mocked(WatchConnectivity!.ackWatchRuns).mockClear();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-a');
  mockedSave.mockReset();
  onWatchRunRetry(null);
});

test('files a queued run once and ignores a re-delivered copy', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  expect(await enqueueWatchRun(run('a'))).toBe(true);
  expect(await processWatchRunQueue('km')).toEqual(['2026-10-10']);
  expect(await enqueueWatchRun(run('a'))).toBe(false);
  expect(await processWatchRunQueue('km')).toEqual([]);
  expect(mockedSave).toHaveBeenCalledTimes(1);
});

test('keeps a run for a retry after a network failure, reusing the entry', async () => {
  await enqueueWatchRun(run('b'));
  mockedSave.mockImplementationOnce(async (_p, _u, _e, onEntryCreated) => {
    await onEntryCreated('entry-9', null);
    throw new Error('offline');
  });
  expect(await processWatchRunQueue('km')).toEqual([]);

  mockedSave.mockResolvedValueOnce({ entryId: 'entry-9', form: null });
  expect(await processWatchRunQueue('km')).toEqual(['2026-10-10']);
  expect(mockedSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ clientId: 'b' }),
    'km',
    'entry-9',
    expect.any(Function),
    null
  );
});

test('keeps the form measured with the entry, hands it back on a retry and to the listener', async () => {
  const form = { avgCadence: 168, strideLengthCm: 112.5, steps: 5000 };
  await enqueueWatchRun(run('f'));
  mockedSave.mockImplementationOnce(async (_p, _u, _e, onEntryCreated) => {
    await onEntryCreated('entry-f', form);
    throw new Error('offline');
  });
  expect(await processWatchRunQueue('km')).toEqual([]);

  mockedSave.mockResolvedValueOnce({ entryId: 'entry-f', form });
  const listener = jest.fn();
  expect(await processWatchRunQueue('km', listener)).toEqual(['2026-10-10']);
  expect(mockedSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ clientId: 'f' }),
    'km',
    'entry-f',
    expect.any(Function),
    form
  );
  expect(listener).toHaveBeenCalledWith(expect.anything(), 'entry-f', form);
});

test('drops a run the server will never accept', async () => {
  jest.useFakeTimers();
  try {
    await enqueueWatchRun(run('c'));
    mockedSave.mockRejectedValueOnce(new ApiError('bad', 400));
    const again = jest.fn();
    onWatchRunRetry(again);
    expect(await processWatchRunQueue('km')).toEqual([]);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(await processWatchRunQueue('km')).toEqual([]);
    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(again).not.toHaveBeenCalled();
  } finally {
    onWatchRunRetry(null);
    jest.useRealTimers();
  }
});

test('tries a retryable failure again after a delay, once', async () => {
  jest.useFakeTimers();
  try {
    const again = jest.fn();
    onWatchRunRetry(again);
    await enqueueWatchRun(run('retry-1'));
    await enqueueWatchRun(run('retry-2'));
    mockedSave.mockRejectedValue(new Error('offline'));
    await processWatchRunQueue('km');
    expect(again).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(30_000);
    expect(again).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(30_000);
    expect(again).toHaveBeenCalledTimes(1);
  } finally {
    onWatchRunRetry(null);
    jest.useRealTimers();
  }
});

test('files a run that arrives while another is being filed', async () => {
  await enqueueWatchRun(run('d'));
  mockedSave.mockImplementationOnce(async () => {
    await enqueueWatchRun(run('e'));
    return 'entry-d';
  });
  mockedSave.mockResolvedValueOnce({ entryId: 'entry-e', form: null });
  const filed = processWatchRunQueue('km');
  // A second trigger while the first is running joins it.
  expect(await processWatchRunQueue('km')).toEqual(await filed);
  expect(mockedSave).toHaveBeenCalledTimes(2);
  expect(await filed).toHaveLength(2);
});

describe('acceptPendingWatchRuns', () => {
  const ack = jest.fn(async () => undefined);

  beforeEach(() => ack.mockClear());

  test('stores a run that arrived before the app was listening, including its laps', async () => {
    const enqueue = jest.fn(async () => true);
    await acceptPendingWatchRuns(
      [{ ...run('cold'), laps: [1_000, 2_000] }],
      enqueue,
      ack
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'cold', laps: [1_000, 2_000] })
    );
    expect(ack).toHaveBeenCalledWith(['cold']);
  });

  test('acks a re-delivered run so the native queue can drop it', async () => {
    const enqueue = jest.fn(async () => false);
    await acceptPendingWatchRuns([run('again')], enqueue, ack);
    expect(ack).toHaveBeenCalledWith(['again']);
  });

  test('leaves a run pending when storing it fails', async () => {
    const enqueue = jest.fn(async (payload: WatchRunPayload) => {
      if (payload.clientId === 'fail') throw new Error('disk full');
      return true;
    });
    await acceptPendingWatchRuns([run('fail'), run('ok')], enqueue, ack);
    expect(ack).toHaveBeenCalledWith(['ok']);
  });
});

test('ticks off the program workout a completed plan run followed', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  await enqueueWatchRun({
    ...run('p1'),
    program: { id: 'beginner5k', index: 3 },
    planCompleted: true,
  });
  await processWatchRunQueue('km');
  expect(completeProgramWorkout).toHaveBeenCalledWith(
    'beginner5k',
    3,
    '2026-10-10',
    'entry-1'
  );
});

test('does not tick off a program run cut short', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  await enqueueWatchRun({
    ...run('p2'),
    program: { id: 'beginner5k', index: 3 },
    planCompleted: false,
  });
  expect(await processWatchRunQueue('km')).toEqual(['2026-10-10']);
  expect(completeProgramWorkout).not.toHaveBeenCalled();
});

test('a tick-off that fails for a reason that may pass keeps the run queued, then ticks it off', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  await enqueueWatchRun({
    ...run('p3'),
    program: { id: 'beginner5k', index: 4 },
    planCompleted: true,
  });
  jest.mocked(completeProgramWorkout).mockRejectedValueOnce(new Error('off'));
  const listener = jest.fn();
  expect(await processWatchRunQueue('km', listener)).toEqual([]);
  // Not announced or marked done: the workout is still to be ticked off.
  expect(listener).not.toHaveBeenCalled();

  expect(await processWatchRunQueue('km', listener)).toEqual(['2026-10-10']);
  expect(completeProgramWorkout).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenCalledTimes(1);
  // The listener is told which diary entry the run was filed as.
  expect(listener).toHaveBeenCalledWith(expect.anything(), 'entry-1', null);
});

test('a tick-off the server will never accept does not hold the run back', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  await enqueueWatchRun({
    ...run('p4'),
    program: { id: 'beginner5k', index: 4 },
    planCompleted: true,
  });
  jest
    .mocked(completeProgramWorkout)
    .mockRejectedValueOnce(new ApiError('bad index', 400));
  expect(await processWatchRunQueue('km')).toEqual(['2026-10-10']);
});

test('a run queued as a pass is finishing is still filed by that pass', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  await enqueueWatchRun(run('r1'));
  let release: () => void = () => {};
  mockedSave.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ entryId: 'entry-1', form: null });
      })
  );
  const first = processWatchRunQueue('km');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await enqueueWatchRun(run('r2'));
  // Joins the running pass, which must look again before it ends.
  const joined = processWatchRunQueue('km');
  release();
  await Promise.all([first, joined]);
  expect(mockedSave).toHaveBeenCalledTimes(2);
  expect(await hasQueuedWatchRuns()).toBe(false);
});

test('tells a listener about each run it files, and survives the listener failing', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  await enqueueWatchRun(run('l1'));
  await enqueueWatchRun(run('l2'));
  const seen: string[] = [];
  const days = await processWatchRunQueue('km', (payload) => {
    seen.push(payload.clientId);
    throw new Error('toast broke');
  });
  expect(seen).toEqual(['l1', 'l2']);
  expect(days).toEqual(['2026-10-10', '2026-10-10']);
  expect(await processWatchRunQueue('km')).toEqual([]);
});

test('learns the indoor factor from a treadmill distance entered on the wrist', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  await enqueueWatchRun({
    ...run('t1'),
    place: 'indoor',
    distanceMeters: 5000,
    distanceScale: 1.1,
    estimatedDistanceMeters: 4400,
  });
  await processWatchRunQueue('km');
  expect(learnWatchIndoorScale).toHaveBeenCalledWith('walk', 1.1, 4400, 5000);
});

test('learns nothing when the watch figure was kept', async () => {
  jest.mocked(learnWatchIndoorScale).mockClear();
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  await enqueueWatchRun({ ...run('t2'), place: 'indoor' });
  await processWatchRunQueue('km');
  expect(learnWatchIndoorScale).not.toHaveBeenCalled();
});

describe('effort rated on the watch', () => {
  const programRun = (clientId: string): WatchRunPayload => ({
    ...run(clientId),
    program: { id: 'beginner5k', index: 4 },
    planCompleted: true,
  });

  test('is saved on the diary entry of a run that is already filed', async () => {
    mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
    await enqueueWatchRun(run('e1'));
    await processWatchRunQueue('km');

    await receiveWatchRunEffort('e1', 7);

    expect(setExerciseEntryEffort).toHaveBeenCalledWith('entry-1', 7);
    expect(rateProgramWorkout).not.toHaveBeenCalled();
    expect(invalidateExerciseCache).toHaveBeenCalledWith(
      expect.anything(),
      '2026-10-10'
    );
  });

  test('waits for a run that is not filed yet, then is saved with it', async () => {
    mockedSave.mockResolvedValue({ entryId: 'entry-2', form: null });
    await enqueueWatchRun(run('e2'));

    await receiveWatchRunEffort('e2', 4);
    expect(setExerciseEntryEffort).not.toHaveBeenCalled();

    await processWatchRunQueue('km');
    expect(setExerciseEntryEffort).toHaveBeenCalledWith('entry-2', 4);
  });

  test('also rates the program workout the run completed', async () => {
    mockedSave.mockResolvedValue({ entryId: 'entry-3', form: null });
    await enqueueWatchRun(programRun('e3'));
    await processWatchRunQueue('km');

    await receiveWatchRunEffort('e3', 9);

    expect(setExerciseEntryEffort).toHaveBeenCalledWith('entry-3', 9);
    expect(rateProgramWorkout).toHaveBeenCalledWith('beginner5k', 4, 9);
  });

  test('is saved once, not again by later passes', async () => {
    mockedSave.mockResolvedValue({ entryId: 'entry-4', form: null });
    await enqueueWatchRun(run('e4'));
    await processWatchRunQueue('km');
    await receiveWatchRunEffort('e4', 6);
    await enqueueWatchRun(run('e4b'));
    await processWatchRunQueue('km');

    expect(setExerciseEntryEffort).toHaveBeenCalledTimes(1);
  });

  test('a failure that may pass keeps the rating for the next pass', async () => {
    mockedSave.mockResolvedValue({ entryId: 'entry-5', form: null });
    await enqueueWatchRun(run('e5'));
    await processWatchRunQueue('km');
    jest
      .mocked(setExerciseEntryEffort)
      .mockRejectedValueOnce(new ApiError('down', 503));

    await receiveWatchRunEffort('e5', 8);
    expect(setExerciseEntryEffort).toHaveBeenCalledTimes(1);

    await enqueueWatchRun(run('e5b'));
    mockedSave.mockResolvedValue({ entryId: 'entry-5b', form: null });
    await processWatchRunQueue('km');
    expect(setExerciseEntryEffort).toHaveBeenCalledTimes(2);
    expect(setExerciseEntryEffort).toHaveBeenLastCalledWith('entry-5', 8);
  });

  test('a rating the server will never accept is dropped, not retried', async () => {
    mockedSave.mockResolvedValue({ entryId: 'entry-6', form: null });
    await enqueueWatchRun(run('e6'));
    await processWatchRunQueue('km');
    jest
      .mocked(setExerciseEntryEffort)
      .mockRejectedValueOnce(new ApiError('gone', 404));

    await receiveWatchRunEffort('e6', 5);
    await enqueueWatchRun(run('e6b'));
    await processWatchRunQueue('km');

    expect(setExerciseEntryEffort).toHaveBeenCalledTimes(1);
  });

  test('ignores a rating outside 1-10 or without a run', async () => {
    await receiveWatchRunEffort('x', 0);
    await receiveWatchRunEffort('x', 11);
    await receiveWatchRunEffort('x', 6.5);
    await receiveWatchRunEffort('', 5);
    expect(await AsyncStorage.getItem('@SparkyFitness/watchRunEffort')).toBe(
      null
    );
  });
  test('a run dropped after its entry exists still rates that entry, not the program', async () => {
    mockedSave.mockImplementation(
      async (_payload, _unit, _entryId, onCreated) => {
        await onCreated?.('entry-9', null);
        throw new ApiError('bad track', 400);
      }
    );
    await enqueueWatchRun(programRun('e9'));
    await processWatchRunQueue('km');
    await expect(hasQueuedWatchRuns()).resolves.toBe(false);

    await receiveWatchRunEffort('e9', 6);

    expect(setExerciseEntryEffort).toHaveBeenCalledWith('entry-9', 6);
    expect(rateProgramWorkout).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        (await AsyncStorage.getItem('@SparkyFitness/watchRunEffort')) ?? '{}'
      )
    ).toEqual({});
  });

  test('a record that never got a rating expires, a rated one does not', async () => {
    const now = jest.spyOn(Date, 'now');
    const t0 = new Date(2026, 9, 10).getTime();
    now.mockReturnValue(t0);
    mockedSave.mockResolvedValue({ entryId: 'entry-10', form: null });
    await enqueueWatchRun(run('unrated'));
    await processWatchRunQueue('km');
    const stored = async () =>
      JSON.parse(
        (await AsyncStorage.getItem('@SparkyFitness/watchRunEffort')) ?? '{}'
      );
    expect(Object.keys(await stored())).toEqual(['unrated']);

    now.mockReturnValue(t0 + 8 * 24 * 60 * 60 * 1000);
    mockedSave.mockResolvedValue({ entryId: 'entry-11', form: null });
    await enqueueWatchRun(run('later'));
    await processWatchRunQueue('km');

    expect(Object.keys(await stored())).toEqual(['later']);
    now.mockRestore();
  });

  test('a program tick-off the server refuses leaves nothing waiting on the program', async () => {
    mockedSave.mockResolvedValue({ entryId: 'entry-12', form: null });
    jest
      .mocked(completeProgramWorkout)
      .mockRejectedValueOnce(new ApiError('bad index', 400));
    await enqueueWatchRun(programRun('e12'));
    await processWatchRunQueue('km');

    await receiveWatchRunEffort('e12', 5);

    expect(setExerciseEntryEffort).toHaveBeenCalledWith('entry-12', 5);
    expect(rateProgramWorkout).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        (await AsyncStorage.getItem('@SparkyFitness/watchRunEffort')) ?? '{}'
      )
    ).toEqual({});
  });

  test('a rating waits for the server configuration its run was filed to', async () => {
    mockedSave.mockResolvedValue({ entryId: 'entry-14', form: null });
    await enqueueWatchRun(run('e14'));
    await processWatchRunQueue('km');

    await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-b');
    await receiveWatchRunEffort('e14', 7);
    expect(setExerciseEntryEffort).not.toHaveBeenCalled();

    await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-a');
    await processWatchRunQueue('km');
    expect(setExerciseEntryEffort).toHaveBeenCalledWith('entry-14', 7);
  });

  test('deleting a configuration also drops the ratings filed to it', async () => {
    mockedSave.mockResolvedValue({ entryId: 'entry-15', form: null });
    await enqueueWatchRun(run('e15'));
    await processWatchRunQueue('km');
    await receiveWatchRunEffort('e15', 7);
    jest.mocked(setExerciseEntryEffort).mockClear();
    await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-b');
    await receiveWatchRunEffort('e15', 8);

    await deleteWatchRunsForConfig('config-a');

    await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-a');
    await processWatchRunQueue('km');
    expect(setExerciseEntryEffort).not.toHaveBeenCalled();
  });

  test('a rating that fails for a reason that may pass is retried later', async () => {
    jest.useFakeTimers();
    try {
      mockedSave.mockResolvedValue({ entryId: 'entry-13', form: null });
      await enqueueWatchRun(run('e13'));
      await processWatchRunQueue('km');
      const again = jest.fn();
      onWatchRunRetry(again);
      jest
        .mocked(setExerciseEntryEffort)
        .mockRejectedValueOnce(new Error('offline'));

      await receiveWatchRunEffort('e13', 8);
      expect(again).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(again).toHaveBeenCalledTimes(1);

      await processWatchRunQueue('km');
      expect(setExerciseEntryEffort).toHaveBeenLastCalledWith('entry-13', 8);
      expect(setExerciseEntryEffort).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

test('does not file a run captured under one config after switching to another, and files it once its own config becomes active again', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-a', form: null });
  await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-a');
  await enqueueWatchRun(run('run-a'));

  await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-b');
  expect(await hasQueuedWatchRuns()).toBe(false);
  expect(await processWatchRunQueue('km')).toEqual([]);
  expect(mockedSave).not.toHaveBeenCalled();

  await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-a');
  expect(await hasQueuedWatchRuns()).toBe(true);
  expect(await processWatchRunQueue('km')).toEqual(['2026-10-10']);
  expect(mockedSave).toHaveBeenCalledTimes(1);
  expect(mockedSave).toHaveBeenCalledWith(
    expect.objectContaining({ clientId: 'run-a', ownerId: 'config-a' }),
    'km',
    undefined,
    expect.any(Function),
    null
  );
});

test('keeps a run that arrives with no active config queued as unattributable rather than filing it to a later account', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-1', form: null });
  await AsyncStorage.removeItem(ACTIVE_CONFIG_KEY);
  await enqueueWatchRun(run('run-no-owner'));

  await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-b');
  expect(await hasQueuedWatchRuns()).toBe(false);
  expect(await processWatchRunQueue('km')).toEqual([]);
  expect(mockedSave).not.toHaveBeenCalled();
});

test('purges queued runs for a deleted or switched-away config without dropping another config', async () => {
  mockedSave.mockResolvedValue({ entryId: 'entry-b', form: null });
  await enqueueWatchRun({ ...run('run-a'), ownerId: 'config-a' });
  await enqueueWatchRun({ ...run('run-b'), ownerId: 'config-b' });

  await deleteWatchRunsForConfig('config-a');
  expect(WatchConnectivity!.ackWatchRuns).toHaveBeenCalledWith([
    'owner:config-a',
  ]);

  await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-a');
  expect(await processWatchRunQueue('km')).toEqual([]);
  expect(mockedSave).not.toHaveBeenCalled();

  await AsyncStorage.setItem(ACTIVE_CONFIG_KEY, 'config-b');
  expect(await processWatchRunQueue('km')).toEqual(['2026-10-10']);
  expect(mockedSave).toHaveBeenCalledTimes(1);
  expect(mockedSave).toHaveBeenCalledWith(
    expect.objectContaining({ clientId: 'run-b', ownerId: 'config-b' }),
    'km',
    undefined,
    expect.any(Function),
    null
  );
});
