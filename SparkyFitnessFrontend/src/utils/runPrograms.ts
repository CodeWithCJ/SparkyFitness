import type { TFunction } from 'i18next';
import {
  type ProgramStatus,
  type ProgramWorkout,
  type RunProgram,
} from '@workspace/shared';
import { PROGRAM_COPY } from '@/constants/runProgramCopy';

/** A built-in program's name; an unknown id reads as itself. */
export const programName = (t: TFunction, id: string): string =>
  t(`trainingPrograms.programs.${id}.name`, PROGRAM_COPY[id]?.name ?? id);

export const programDescription = (t: TFunction, id: string): string =>
  t(
    `trainingPrograms.programs.${id}.description`,
    PROGRAM_COPY[id]?.description ?? ''
  );

/** What a program's weeks look like. */
export const programStructure = (t: TFunction, id: string): string =>
  t(
    `trainingPrograms.programs.${id}.structure`,
    PROGRAM_COPY[id]?.structure ?? ''
  );

/** A program's name: the person's own for a custom one, else the built-in's. */
export const programTitle = (t: TFunction, program: RunProgram): string =>
  program.custom?.name || programName(t, program.id);

/** "Workout 4" or the person's own name for a workout of a custom program. */
export const customWorkoutTitle = (
  t: TFunction,
  workout: ProgramWorkout
): string =>
  workout.title ||
  t('trainingPrograms.workout.number', 'Workout {{number}}', {
    number: workout.week * 7 + workout.day + 1,
  });

/** "Week 3, run 2" for a workout of `program`, without the program's name. */
export const workoutTitle = (
  t: TFunction,
  program: RunProgram,
  workout: ProgramWorkout
): string => {
  if (program.custom) return customWorkoutTitle(t, workout);
  if (program.activity === 'walk') {
    return t(
      'trainingPrograms.workout.titleWalk',
      'Week {{week}}, walk {{walk}}',
      {
        week: workout.week + 1,
        walk: workout.day + 1,
      }
    );
  }
  return t('trainingPrograms.workout.titleRun', 'Week {{week}}, run {{run}}', {
    week: workout.week + 1,
    run: workout.day + 1,
  });
};

/** The program's name and the workout due, or just its name when finished. */
export const programWorkoutLabel = (
  t: TFunction,
  status: ProgramStatus
): string =>
  status.workout
    ? t('trainingPrograms.workout.label', '{{name}} · {{workout}}', {
        name: programTitle(t, status.program),
        workout: workoutTitle(t, status.program, status.workout),
      })
    : programTitle(t, status.program);

/** A calendar day (YYYY-MM-DD) as text, e.g. "Mon, Oct 19". */
export const formatDayLabel = (
  day: string,
  locale: string,
  style: 'long' | 'short' = 'short'
): string => {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: style,
    month: style,
    day: 'numeric',
    timeZone: 'UTC',
  });
};

/** A weekday (0 = Sunday) as text in `locale`, e.g. "Mon". */
export const weekdayLabel = (
  day: number,
  locale: string,
  style: 'short' | 'long' = 'short'
): string =>
  // 2024-01-07 was a Sunday, so day 0 is Sunday.
  new Date(Date.UTC(2024, 0, 7 + day)).toLocaleDateString(locale, {
    weekday: style,
    timeZone: 'UTC',
  });
