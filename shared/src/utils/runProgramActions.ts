import type {
  RunProgramResponse,
  UpsertRunProgramBody,
} from '../schemas/api/RunProgram.api.zod.ts';

/**
 * Request bodies for the changes a person makes to their run program. Each is
 * one `PUT /api/v2/run-program` carrying only the fields that move, built from
 * the program as the server holds it.
 */

type HeldProgram = Pick<RunProgramResponse, 'program_id'>;

/**
 * Starts `programId` from its first workout and switches it on, also when it
 * is the program already held (the server keeps the place unless told).
 * `startDay` null = today; absent keeps the schedule.
 */
export const startProgramBody = (
  programId: string,
  startDay?: string | null
): UpsertRunProgramBody => ({
  program_id: programId,
  enabled: true,
  next_index: 0,
  start_date: startDay,
});

export const setEnabledBody = (
  program: HeldProgram,
  enabled: boolean
): UpsertRunProgramBody => ({ program_id: program.program_id, enabled });

/** Jumps to any workout (0-based), to repeat one or start further in. */
export const setPositionBody = (
  program: HeldProgram,
  index: number
): UpsertRunProgramBody => ({
  program_id: program.program_id,
  next_index: Math.max(0, Math.floor(index)),
});

/** Skips the workout that is due. */
export const skipWorkoutBody = (
  program: HeldProgram & Pick<RunProgramResponse, 'next_index'>
): UpsertRunProgramBody => setPositionBody(program, program.next_index + 1);

/** Goes back to the first workout. */
export const restartBody = (program: HeldProgram): UpsertRunProgramBody =>
  setPositionBody(program, 0);

/** Flips one weekday (0 = Sunday) on the days the program has now. */
export const toggleDayBody = (
  program: HeldProgram & Pick<RunProgramResponse, 'run_days'>,
  day: number
): UpsertRunProgramBody => ({
  program_id: program.program_id,
  run_days: program.run_days.includes(day)
    ? program.run_days.filter((d) => d !== day)
    : [...program.run_days, day].sort((a, b) => a - b),
});

/** null clears a day; omitting a field leaves it as it is. */
export const scheduleBody = (
  program: HeldProgram,
  change: { startDay?: string | null; endDay?: string | null }
): UpsertRunProgramBody => ({
  program_id: program.program_id,
  ...(change.startDay !== undefined && { start_date: change.startDay }),
  ...(change.endDay !== undefined && { end_date: change.endDay }),
});
