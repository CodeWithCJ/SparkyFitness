import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  restartBody,
  scheduleBody,
  setEnabledBody,
  setPositionBody,
  skipWorkoutBody,
  startProgramBody,
  toggleDayBody,
  suggestFromEffort,
  type EffortSuggestion,
  pendingEffortRating,
  storedProgramStatus,
  type CustomRunProgramInput,
  type CustomRunProgramResponse,
  type ProgramStatus,
  type RunProgramAdjustment,
  type RunProgramResponse,
} from '@workspace/shared';
import { queryClient } from '../hooks/queryClient';
import { toLocalDateString } from '../utils/dateUtils';
import { programWorkoutForEntry } from '../utils/runProgramSummary';
import {
  customRunProgramsQueryKey,
  runProgramQueryKey,
  trainingCalendarRootQueryKey,
} from '../hooks/queryKeys';
import {
  adjustRunProgramRunning,
  createCustomRunProgram,
  deleteCustomRunProgram,
  fetchCustomRunPrograms,
  fetchRunProgram,
  updateCustomRunProgram,
  markRunProgramWorkoutDone,
  rateRunProgramWorkout,
  realignRunProgram,
  saveRunProgram,
} from './api/runProgramApi';

/**
 * The person's run program and place in it. It lives on the server so the AI
 * assistant can adjust upcoming workouts and every device agrees on where they
 * are; this keeps the React Query copy in step after each change. The Diary
 * schedule (run days and first day) is kept with the program.
 */

const setCache = (program: RunProgramResponse | null) => {
  // A read that began before this write must not land after it and put the
  // old state back (a screen mounting while a tick-off is in flight).
  void queryClient.cancelQueries({ queryKey: runProgramQueryKey });
  queryClient.setQueryData(runProgramQueryKey, program);
  // Where the program puts its workouts is part of the plan calendar.
  void queryClient.invalidateQueries({
    queryKey: [...trainingCalendarRootQueryKey],
  });
};

async function load(): Promise<RunProgramResponse | null> {
  return (await fetchRunProgram()).program;
}

/**
 * Changes when the Diary offers the workout: the weekdays (none = whenever),
 * the first day (null = from today) and the goal day (null = none). Kept with
 * the program on the server.
 */
export interface ProgramScheduleChange {
  days?: number[];
  /** Flips one weekday on the server's current days (0 = Sunday). */
  toggleDay?: number;
  startDay?: string | null;
  endDay?: string | null;
}

// Schedule changes run one at a time: two quick taps on the weekday chips must
// each build on the result of the one before, not on the same stale copy.
let scheduleQueue: Promise<unknown> = Promise.resolve();

export function setProgramSchedule(
  change: ProgramScheduleChange
): Promise<void> {
  const run = scheduleQueue.then(() => applySchedule(change));
  scheduleQueue = run.catch(() => undefined);
  return run;
}

async function applySchedule(change: ProgramScheduleChange): Promise<void> {
  const current = await freshProgram();
  if (!current) return;
  const body =
    change.toggleDay !== undefined
      ? toggleDayBody(current, change.toggleDay)
      : { program_id: current.program_id, run_days: change.days };
  setCache(
    (
      await saveRunProgram({
        ...body,
        ...scheduleBody(current, {
          startDay: change.startDay,
          endDay: change.endDay,
        }),
      })
    ).program
  );
}

/** The stored program as the server has it now, not as this device last saw it. */
const freshProgram = (): Promise<RunProgramResponse | null> =>
  queryClient.fetchQuery({
    queryKey: runProgramQueryKey,
    queryFn: load,
    staleTime: 0,
  });

const syncedToolCalls = new Set<string>();

/** The assistant may have changed the program: drop the cached copy, once per tool call. */
export function syncAfterAssistantChange(toolCallId: string): void {
  if (syncedToolCalls.has(toolCallId)) return;
  syncedToolCalls.add(toolCallId);
  void queryClient.invalidateQueries({ queryKey: runProgramQueryKey });
}

/** The program being used, or null when none is chosen or it is switched off. */
export async function getProgramStatus(): Promise<ProgramStatus | null> {
  const program = await freshProgram();
  return program?.enabled ? storedProgramStatus(program) : null;
}

/**
 * Switches the program on or off. Turning it on for the first time starts
 * `programId` from its first workout; after that it picks up where the person
 * left off. Turning it off keeps their place.
 */
export async function setProgramEnabled(
  enabled: boolean,
  programId: string
): Promise<void> {
  const current = await freshProgram();
  if (!current && !enabled) return;
  setCache(
    (
      await saveRunProgram(
        setEnabledBody(
          { program_id: current?.program_id ?? programId },
          enabled
        )
      )
    ).program
  );
}

/**
 * Starts `programId` from its first workout and switches it on. Choosing a
 * different program replaces it (the server reseeds the workouts and the
 * place); choosing the one already held goes back to its first workout.
 * `startDay` sets the first day (null = today); leave it out to keep the
 * schedule as it is.
 */
export async function startProgram(
  programId: string,
  startDay?: string | null
): Promise<void> {
  setCache(
    (await saveRunProgram(startProgramBody(programId, startDay))).program
  );
}

/** Jumps to any workout (0-based), to repeat one or start further in. */
export async function setProgramPosition(index: number): Promise<void> {
  const current = await freshProgram();
  if (!current) return;
  setCache((await saveRunProgram(setPositionBody(current, index))).program);
}

/** Goes back to the first workout, keeping the program switched on. */
export async function restartProgram(): Promise<void> {
  const current = await freshProgram();
  if (!current) return;
  setCache((await saveRunProgram(restartBody(current))).program);
}

/** Skips the workout that is due. */
export async function skipProgramWorkout(): Promise<void> {
  const current = await freshProgram();
  if (!current) return;
  setCache((await saveRunProgram(skipWorkoutBody(current))).program);
}

/**
 * Records workout `index` as done, if it is the one that was due. `entryId` is
 * the diary entry it was done as, so that entry shows as part of the program.
 */
export async function completeProgramWorkout(
  programId: string,
  index: number,
  day: string = toLocalDateString(new Date()),
  entryId?: string
): Promise<void> {
  // The local day is sent so the Diary stops offering the next workout for the
  // rest of that day, on every device.
  setCache(
    (
      await markRunProgramWorkoutDone({
        index,
        program_id: programId,
        day,
        entry_id: entryId,
      })
    ).program
  );
}

/** Eases (negative) or lengthens the running in the next `count` workouts. */
export async function adjustProgramRunning(
  percent: number,
  count: number
): Promise<void> {
  setCache((await adjustRunProgramRunning({ percent, count })).program);
}

/**
 * Rebuilds the rest of the plan to finish on the goal day. `token` is the one
 * from the preview the person accepted, so a plan that changed meanwhile
 * (another device, Sparky) is refused rather than rewritten blind; `force`
 * is the person's choice to go ahead although the goal is tight.
 */
export async function applyProgramRealign(options: {
  token: string;
  force?: boolean;
  today: string;
}): Promise<void> {
  try {
    const { program } = await realignRunProgram({
      confirmed: true,
      token: options.token,
      force: options.force,
      today: options.today,
    });
    setCache(program);
  } catch (error) {
    // Whatever went wrong, the card should be worked out from the server's copy.
    void queryClient.invalidateQueries({ queryKey: runProgramQueryKey });
    throw error;
  }
}

/**
 * Saves how hard finished workout `index` felt and returns the program as the
 * server now holds it (unchanged if that workout cannot be rated).
 */
export async function rateProgramWorkout(
  programId: string,
  index: number,
  rating: number
): Promise<RunProgramResponse | null> {
  const program = (
    await rateRunProgramWorkout({ index, rating, program_id: programId })
  ).program;
  setCache(program);
  return program;
}

/** The current time; read when the Diary renders, as the card ages out over two days. */
const clockNow = (): number => Date.now();

/** The current program status, or null when none is active. */
export function useRunProgram(): {
  /** The program as the server holds it, including its logs, or null. */
  program: RunProgramResponse | null;
  /** The place in the program, even while it is switched off. */
  status: ProgramStatus | null;
  /** Whether the person is using it. */
  enabled: boolean;
  /** The most recent change to the workouts or place made by Sparky or the person, if any. */
  lastAdjustment: RunProgramAdjustment | null;
  /** When the Diary offers the workout: weekdays (empty = every day) and first day. */
  schedule: {
    days: number[];
    startDay: string | null;
    endDay: string | null;
  };
  /** The local day a program workout was last completed, or null. */
  doneDay: string | null;
  /** The latest program workout still waiting to be rated, if recent. */
  pendingEffort: { programId: string; index: number } | null;
  /** What the last two rated workouts say about pace: ease off, move on or neither. */
  effortSuggestion: EffortSuggestion | null;
  loaded: boolean;
  refetch: () => Promise<unknown>;
} {
  const { data, isSuccess, refetch } = useQuery({
    queryKey: runProgramQueryKey,
    queryFn: load,
    // Always re-read on opening a screen: the assistant may have changed it.
    staleTime: 0,
  });
  const pending = data
    ? pendingEffortRating(data.completion_log, data.effort_log, clockNow())
    : null;
  return {
    program: data ?? null,
    status: data ? storedProgramStatus(data) : null,
    enabled: data?.enabled ?? false,
    lastAdjustment: data?.adjustment_log.at(-1) ?? null,
    schedule: {
      days: data?.run_days ?? [],
      startDay: data?.start_date ?? null,
      endDay: data?.end_date ?? null,
    },
    doneDay: data?.last_done_date ?? null,
    pendingEffort:
      pending && data
        ? { programId: data.program_id, index: pending.index }
        : null,
    effortSuggestion: data
      ? suggestFromEffort(data.effort_log, data.next_index)
      : null,
    loaded: isSuccess,
    refetch,
  };
}

/**
 * The program workout a diary entry was done as (its `workout` is that one),
 * or null when the entry is not part of the person's program.
 */
export function useProgramWorkoutForEntry(
  entryId: string | undefined
): ProgramStatus | null {
  const { data } = useQuery({
    queryKey: runProgramQueryKey,
    queryFn: load,
    staleTime: 60_000,
    enabled: entryId != null,
  });
  return useMemo(
    () => (data && entryId ? programWorkoutForEntry(data, entryId) : null),
    [data, entryId]
  );
}

/** The person's own programs, newest first, and whether they have loaded. */
export function useCustomRunPrograms(): {
  programs: CustomRunProgramResponse[];
  loaded: boolean;
  refetch: () => Promise<unknown>;
} {
  const { data, isSuccess, refetch } = useQuery({
    queryKey: customRunProgramsQueryKey,
    queryFn: async () => (await fetchCustomRunPrograms()).programs,
    staleTime: 0,
  });
  return { programs: data ?? [], loaded: isSuccess, refetch };
}

const refreshCustomPrograms = () =>
  queryClient.invalidateQueries({ queryKey: customRunProgramsQueryKey });

/** Saves a new program (no `id`) or changes one; the copy being run follows. */
export async function saveCustomProgram(
  input: CustomRunProgramInput,
  id?: string
): Promise<CustomRunProgramResponse> {
  const { program } = id
    ? await updateCustomRunProgram(id, input)
    : await createCustomRunProgram(input);
  await refreshCustomPrograms();
  // Editing changes the copy being run on the server.
  if (id) await queryClient.invalidateQueries({ queryKey: runProgramQueryKey });
  return program;
}

export async function removeCustomProgram(id: string): Promise<void> {
  await deleteCustomRunProgram(id);
  await refreshCustomPrograms();
}
