import { findProgram, type RunProgramResponse } from '@workspace/shared';
import { queryClient } from '../../src/hooks/queryClient';
import { runProgramQueryKey } from '../../src/hooks/queryKeys';
import {
  fetchRunProgram,
  markRunProgramWorkoutDone,
  saveRunProgram,
} from '../../src/services/api/runProgramApi';
import {
  completeProgramWorkout,
  getProgramStatus,
  restartProgram,
  setProgramEnabled,
  setProgramPosition,
  setProgramSchedule,
  skipProgramWorkout,
} from '../../src/services/runProgramService';

jest.mock('../../src/services/api/runProgramApi');

const stored = (
  over: Partial<RunProgramResponse> = {}
): RunProgramResponse => ({
  id: 'p1',
  program_id: 'beginner5k',
  enabled: true,
  next_index: 0,
  workouts: findProgram('beginner5k')!.workouts,
  adjustment_log: [],
  run_days: [],
  start_date: null,
  end_date: null,
  last_done_date: null,
  updated_at: '2026-10-10T00:00:00.000Z',
  ...over,
});

const mockedFetch = jest.mocked(fetchRunProgram);
const mockedSave = jest.mocked(saveRunProgram);
const mockedDone = jest.mocked(markRunProgramWorkoutDone);

beforeEach(() => {
  jest.resetAllMocks();
  queryClient.clear();
});

test('has no program until the server has one', async () => {
  mockedFetch.mockResolvedValue({ program: null });
  expect(await getProgramStatus()).toBeNull();
});

test('reads the place and the adjusted workouts from the server', async () => {
  const workouts = findProgram('beginner5k')!.workouts.map((w, i) =>
    i === 4 ? { ...w, plan: { ...w.plan, steps: w.plan.steps.slice(0, 3) } } : w
  );
  mockedFetch.mockResolvedValue({
    program: stored({ next_index: 4, workouts }),
  });
  const status = await getProgramStatus();
  expect(status?.done).toBe(4);
  expect(status?.workout?.plan.steps).toHaveLength(3);
});

test('a switched-off program is not reported as being used', async () => {
  mockedFetch.mockResolvedValue({ program: stored({ enabled: false }) });
  expect(await getProgramStatus()).toBeNull();
});

test('switching on starts the program and caches the answer', async () => {
  mockedFetch.mockResolvedValue({ program: null });
  mockedSave.mockResolvedValue({ program: stored() });
  await setProgramEnabled(true, 'beginner5k');
  expect(mockedSave).toHaveBeenCalledWith({
    program_id: 'beginner5k',
    enabled: true,
  });
  expect(
    queryClient.getQueryData<RunProgramResponse>(runProgramQueryKey)?.id
  ).toBe('p1');
});

test('switching off with nothing started does nothing', async () => {
  mockedFetch.mockResolvedValue({ program: null });
  await setProgramEnabled(false, 'beginner5k');
  expect(mockedSave).not.toHaveBeenCalled();
});

test('moves, restarts and skips relative to the place the server has', async () => {
  mockedFetch.mockResolvedValue({ program: stored({ next_index: 3 }) });
  mockedSave.mockImplementation(async (body) => ({
    program: stored({ next_index: body.next_index ?? 0 }),
  }));

  await skipProgramWorkout();
  expect(mockedSave).toHaveBeenLastCalledWith({
    program_id: 'beginner5k',
    next_index: 4,
  });
  await setProgramPosition(13);
  expect(mockedSave).toHaveBeenLastCalledWith({
    program_id: 'beginner5k',
    next_index: 13,
  });
  await restartProgram();
  expect(mockedSave).toHaveBeenLastCalledWith({
    program_id: 'beginner5k',
    next_index: 0,
  });
});

test('switching on keeps the program the server holds, whatever this device had cached', async () => {
  queryClient.setQueryData(runProgramQueryKey, null);
  mockedFetch.mockResolvedValue({
    program: stored({ program_id: 'marathon', enabled: false }),
  });
  mockedSave.mockResolvedValue({ program: stored({ program_id: 'marathon' }) });
  await setProgramEnabled(true, 'beginner5k');
  expect(mockedSave).toHaveBeenCalledWith({
    program_id: 'marathon',
    enabled: true,
  });
});

test('a move without a program does nothing', async () => {
  mockedFetch.mockResolvedValue({ program: null });
  await setProgramPosition(5);
  expect(mockedSave).not.toHaveBeenCalled();
});

test('completing a workout sends its index and caches the result', async () => {
  mockedDone.mockResolvedValue({ program: stored({ next_index: 1 }) });
  await completeProgramWorkout('beginner5k', 0);
  expect(mockedDone).toHaveBeenCalledWith({
    index: 0,
    program_id: 'beginner5k',
    day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });

  await completeProgramWorkout('beginner5k', 1, '2026-10-12', 'entry-7');
  expect(mockedDone).toHaveBeenLastCalledWith({
    index: 1,
    program_id: 'beginner5k',
    day: '2026-10-12',
    entry_id: 'entry-7',
  });
  expect(
    queryClient.getQueryData<RunProgramResponse>(runProgramQueryKey)?.next_index
  ).toBe(1);
});

test('saves the Diary days and first day with the program on the server', async () => {
  mockedFetch.mockResolvedValue({ program: stored() });
  mockedSave.mockImplementation(async (body) => ({
    program: stored({
      run_days: body.run_days ?? [],
      start_date: body.start_date ?? null,
    }),
  }));
  await setProgramSchedule({ days: [1, 3] });
  expect(mockedSave).toHaveBeenLastCalledWith({
    program_id: 'beginner5k',
    run_days: [1, 3],
    start_date: undefined,
    end_date: undefined,
  });
  await setProgramSchedule({ endDay: '2026-12-06' });
  expect(mockedSave).toHaveBeenLastCalledWith({
    program_id: 'beginner5k',
    run_days: undefined,
    start_date: undefined,
    end_date: '2026-12-06',
  });
  await setProgramSchedule({ startDay: '2026-10-13' });
  expect(mockedSave).toHaveBeenLastCalledWith({
    program_id: 'beginner5k',
    run_days: undefined,
    start_date: '2026-10-13',
    end_date: undefined,
  });
  expect(
    queryClient.getQueryData<RunProgramResponse>(runProgramQueryKey)?.start_date
  ).toBe('2026-10-13');
});

test('a schedule change without a program does nothing', async () => {
  mockedFetch.mockResolvedValue({ program: null });
  await setProgramSchedule({ days: [1] });
  expect(mockedSave).not.toHaveBeenCalled();
});

test('two quick weekday taps each build on the result of the one before', async () => {
  // The server is the source of truth: each toggle reads its days first.
  let serverDays: number[] = [];
  mockedFetch.mockImplementation(async () => ({
    program: stored({ run_days: serverDays }),
  }));
  mockedSave.mockImplementation(async (body) => {
    serverDays = body.run_days ?? serverDays;
    return { program: stored({ run_days: serverDays }) };
  });
  await Promise.all([
    setProgramSchedule({ toggleDay: 1 }),
    setProgramSchedule({ toggleDay: 3 }),
  ]);
  expect(serverDays).toEqual([1, 3]);
  expect(
    queryClient.getQueryData<RunProgramResponse>(runProgramQueryKey)?.run_days
  ).toEqual([1, 3]);
  await setProgramSchedule({ toggleDay: 1 });
  expect(serverDays).toEqual([3]);
});

test('a failed schedule change does not block the next one', async () => {
  mockedFetch.mockResolvedValue({ program: stored() });
  mockedSave.mockRejectedValueOnce(new Error('offline'));
  await expect(setProgramSchedule({ toggleDay: 1 })).rejects.toThrow('offline');
  mockedSave.mockResolvedValueOnce({ program: stored({ run_days: [2] }) });
  await setProgramSchedule({ toggleDay: 2 });
  expect(mockedSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ run_days: [2] })
  );
});

test('a write cancels a read that began before it', async () => {
  mockedFetch.mockResolvedValue({ program: stored() });
  mockedDone.mockResolvedValue({ program: stored({ next_index: 1 }) });
  const spy = jest.spyOn(queryClient, 'cancelQueries');
  await completeProgramWorkout('beginner5k', 0, '2026-10-12');
  expect(spy).toHaveBeenCalledWith({ queryKey: runProgramQueryKey });
  expect(mockedDone).toHaveBeenCalledWith(
    expect.objectContaining({ day: '2026-10-12' })
  );
  spy.mockRestore();
});
