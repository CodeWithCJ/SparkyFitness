import type { TFunction } from 'i18next';
import {
  projectRuns,
  storedProgramStatus,
  type ProgramStatus,
  type RunProgramResponse,
} from '@workspace/shared';
import { formatDayLabel } from './dayLabel';

/**
 * One line for after a program run is saved: what is next and when. Works from
 * the program as the server now holds it, so the workout just finished is
 * already behind it.
 */
export function nextProgramLine(
  t: TFunction,
  stored: RunProgramResponse,
  today: string,
  workoutLabel: (status: ProgramStatus) => string
): string {
  const status = storedProgramStatus(stored);
  if (status.finished) {
    return t('recordActivity.program.savedFinished', {
      defaultValue: 'Program complete. Well done!',
    });
  }
  const label = workoutLabel(status);
  const [next] = projectRuns({
    total: status.total,
    next: status.done,
    today,
    doneToday: true,
    limit: 1,
    schedule: {
      runDays: stored.run_days,
      startDay: stored.start_date,
      endDay: stored.end_date,
    },
  });
  if (!next) {
    return t('recordActivity.program.savedNext', {
      label,
      defaultValue: 'Next: {{label}}',
    });
  }
  return t('recordActivity.program.savedNextOn', {
    label,
    date: formatDayLabel(next.day),
    defaultValue: 'Next: {{label}} on {{date}}',
  });
}

/**
 * The program part of a run summary: the place reached, and what is next. Null
 * when the program is not in the cache (offline, or never loaded).
 */
export function programSummary(
  t: TFunction,
  stored: RunProgramResponse | undefined,
  today: string,
  workoutLabel: (status: ProgramStatus) => string,
  finishedIndex?: number
): {
  nextLine: string;
  done: number;
  total: number;
  finished: boolean;
  rate: { programId: string; index: number } | null;
} | null {
  if (!stored) return null;
  const status = storedProgramStatus(stored);
  return {
    nextLine: nextProgramLine(t, stored, today, workoutLabel),
    done: status.done,
    total: status.total,
    finished: status.finished,
    rate:
      finishedIndex === undefined
        ? null
        : { programId: stored.program_id, index: finishedIndex },
  };
}

/**
 * The program workout diary entry `entryId` was done as, with `workout` set to
 * that workout, or null when the program has no record of it.
 */
export function programWorkoutForEntry(
  stored: RunProgramResponse,
  entryId: string
): ProgramStatus | null {
  const done = stored.completion_log
    .filter((entry) => entry.entry_id === entryId)
    .at(-1);
  const workout = done ? stored.workouts[done.index] : undefined;
  if (!workout) return null;
  return { ...storedProgramStatus(stored), workout };
}
