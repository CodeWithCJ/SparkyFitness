import {
  MAX_CUSTOM_PROGRAM_WORKOUTS,
  type RunProgram,
  type CustomRunProgramInput,
  type CustomRunProgramResponse,
} from '@workspace/shared';

export type StepKind = 'warmup' | 'work' | 'recovery' | 'cooldown';
export type DraftActivity = 'run' | 'walk';

export interface DraftStep {
  kind: StepKind;
  seconds: number;
  /** Pace to hold in the step, seconds per km (fast edge first). */
  pace?: { minSecondsPerKm: number; maxSecondsPerKm: number };
  /** Heart-rate range to hold in the step. */
  heartRate?: { minBpm: number; maxBpm: number };
}

export interface DraftWorkout {
  title: string;
  steps: DraftStep[];
}

export interface ProgramDraft {
  name: string;
  activity: DraftActivity;
  workouts: DraftWorkout[];
}

export const STEP_KINDS: readonly StepKind[] = [
  'warmup',
  'work',
  'recovery',
  'cooldown',
];

export const MAX_STEPS_PER_WORKOUT = 200;
export const MAX_STEP_SECONDS = 14400;

/** A starting workout: five minutes easy, twenty hard, five easy. */
export const newWorkout = (): DraftWorkout => ({
  title: '',
  steps: [
    { kind: 'warmup', seconds: 300 },
    { kind: 'work', seconds: 1200 },
    { kind: 'cooldown', seconds: 300 },
  ],
});

export const emptyDraft = (): ProgramDraft => ({
  name: '',
  activity: 'run',
  workouts: [newWorkout()],
});

export function draftFromProgram(
  program: CustomRunProgramResponse
): ProgramDraft {
  return {
    name: program.name,
    activity: program.activity,
    workouts: program.workouts.map((workout) => ({
      title: workout.title ?? '',
      steps: workout.plan.steps.map((step) => ({ ...step })),
    })),
  };
}

/**
 * A copy of a built-in program to edit as one's own. Each workout keeps its
 * plan and gets a title (the built-in's own "Week 3, run 2" from `titleOf`),
 * since a custom plan has no weeks to say where a workout came from.
 */
export function draftFromBuiltIn(
  program: RunProgram,
  name: string,
  titleOf: (workout: RunProgram['workouts'][number]) => string
): ProgramDraft {
  return {
    name: name.slice(0, 60),
    activity: program.activity,
    workouts: program.workouts.map((workout) => ({
      title: titleOf(workout).slice(0, 40),
      steps: workout.plan.steps.map((step) => ({
        kind: step.kind,
        seconds: step.seconds,
        ...(step.pace ? { pace: { ...step.pace } } : {}),
        ...(step.heartRate ? { heartRate: { ...step.heartRate } } : {}),
      })),
    })),
  };
}

export function draftToInput(draft: ProgramDraft): CustomRunProgramInput {
  const style = draft.activity === 'walk' ? 'fastEasy' : 'runWalk';
  return {
    name: draft.name.trim(),
    activity: draft.activity,
    workouts: draft.workouts.map((workout) => {
      const title = workout.title.trim();
      return {
        plan: { style, steps: workout.steps.map((step) => ({ ...step })) },
        ...(title ? { title } : {}),
      };
    }),
  };
}

export type DraftProblem = 'name' | 'noWorkouts' | 'emptyWorkout';

/** What stops the draft being saved, or null. */
export function draftProblem(draft: ProgramDraft): DraftProblem | null {
  if (!draft.name.trim()) return 'name';
  if (draft.workouts.length === 0) return 'noWorkouts';
  if (draft.workouts.some((workout) => workout.steps.length === 0)) {
    return 'emptyWorkout';
  }
  return null;
}

export const canAddWorkout = (draft: ProgramDraft): boolean =>
  draft.workouts.length < MAX_CUSTOM_PROGRAM_WORKOUTS;

const replaceAt = <T>(list: T[], index: number, item: T): T[] =>
  list.map((existing, i) => (i === index ? item : existing));

const setWorkout = (
  draft: ProgramDraft,
  index: number,
  change: (workout: DraftWorkout) => DraftWorkout
): ProgramDraft => {
  const workout = draft.workouts[index];
  if (!workout) return draft;
  return {
    ...draft,
    workouts: replaceAt(draft.workouts, index, change(workout)),
  };
};

export function addWorkout(draft: ProgramDraft): ProgramDraft {
  if (!canAddWorkout(draft)) return draft;
  return { ...draft, workouts: [...draft.workouts, newWorkout()] };
}

/** A copy of workout `index` placed right after it. */
export function duplicateWorkout(
  draft: ProgramDraft,
  index: number
): ProgramDraft {
  const workout = draft.workouts[index];
  if (!workout || !canAddWorkout(draft)) return draft;
  const copy = { ...workout, steps: workout.steps.map((s) => ({ ...s })) };
  const workouts = [...draft.workouts];
  workouts.splice(index + 1, 0, copy);
  return { ...draft, workouts };
}

export function removeWorkout(
  draft: ProgramDraft,
  index: number
): ProgramDraft {
  return { ...draft, workouts: draft.workouts.filter((_, i) => i !== index) };
}

/** Moves workout `index` by `by` places (negative = earlier). */
export function moveWorkout(
  draft: ProgramDraft,
  index: number,
  by: number
): ProgramDraft {
  const target = index + by;
  if (target < 0 || target >= draft.workouts.length || by === 0) return draft;
  const workouts = [...draft.workouts];
  const [moved] = workouts.splice(index, 1);
  workouts.splice(target, 0, moved);
  return { ...draft, workouts };
}

export const setWorkoutTitle = (
  draft: ProgramDraft,
  index: number,
  title: string
): ProgramDraft => setWorkout(draft, index, (w) => ({ ...w, title }));

/** A new step that carries on from the last: hard after easy, easy after hard. */
export function addStep(draft: ProgramDraft, index: number): ProgramDraft {
  return setWorkout(draft, index, (workout) => {
    if (workout.steps.length >= MAX_STEPS_PER_WORKOUT) return workout;
    const last = workout.steps.at(-1);
    const kind: StepKind = last?.kind === 'work' ? 'recovery' : 'work';
    return {
      ...workout,
      steps: [...workout.steps, { kind, seconds: kind === 'work' ? 300 : 120 }],
    };
  });
}

export const removeStep = (
  draft: ProgramDraft,
  index: number,
  step: number
): ProgramDraft =>
  setWorkout(draft, index, (workout) => ({
    ...workout,
    steps: workout.steps.filter((_, i) => i !== step),
  }));

/** Cycles a step through warm up, work, recovery and cool down. */
export const cycleStepKind = (
  draft: ProgramDraft,
  index: number,
  step: number
): ProgramDraft =>
  setWorkout(draft, index, (workout) => {
    const current = workout.steps[step];
    if (!current) return workout;
    const next = STEP_KINDS[(STEP_KINDS.indexOf(current.kind) + 1) % 4];
    // Warm up and cool down take no target, so a step moved onto them loses it.
    const { pace, heartRate, ...plain } = current;
    const keepTargets = next === 'work' || next === 'recovery';
    return {
      ...workout,
      steps: replaceAt(workout.steps, step, {
        ...plain,
        kind: next,
        ...(keepTargets && pace ? { pace } : {}),
        ...(keepTargets && heartRate ? { heartRate } : {}),
      }),
    };
  });

/** Half a minute at a time under five minutes, a minute at a time above. */
const stepIncrement = (seconds: number, direction: 1 | -1): number => {
  const size = seconds > 300 || (seconds === 300 && direction === 1) ? 60 : 30;
  return size;
};

export function nudgeStep(
  draft: ProgramDraft,
  index: number,
  step: number,
  direction: 1 | -1
): ProgramDraft {
  return setWorkout(draft, index, (workout) => {
    const current = workout.steps[step];
    if (!current) return workout;
    const size = stepIncrement(current.seconds, direction);
    const seconds = Math.min(
      MAX_STEP_SECONDS,
      Math.max(30, current.seconds + direction * size)
    );
    return {
      ...workout,
      steps: replaceAt(workout.steps, step, { ...current, seconds }),
    };
  });
}

export const workoutSeconds = (workout: DraftWorkout): number =>
  workout.steps.reduce((sum, step) => sum + step.seconds, 0);

/** "5:30" (or "5.30") as seconds, or null when it is not a pace. */
export function parseClock(text: string): number | null {
  const match = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[2]) < 60 ? seconds : null;
}

/** A pace band when both edges are valid paces at least 10 s apart, else null. */
export function paceBandFrom(
  fast: string,
  slow: string
): DraftStep['pace'] | null {
  const min = parseClock(fast);
  const max = parseClock(slow);
  if (min === null || max === null) return null;
  if (min < 120 || max > 1200 || max - min < 10) return null;
  return { minSecondsPerKm: min, maxSecondsPerKm: max };
}

/** A heart-rate band when both are bpm in range and at least 10 apart, else null. */
export function heartRateBandFrom(
  low: string,
  high: string
): DraftStep['heartRate'] | null {
  if (!/^\d{2,3}$/.test(low.trim()) || !/^\d{2,3}$/.test(high.trim())) {
    return null;
  }
  const min = Number(low);
  const max = Number(high);
  if (min < 40 || max > 220 || max - min < 10) return null;
  return { minBpm: min, maxBpm: max };
}

/** Sets or clears (null) a step's pace or heart-rate target. */
export const setStepTarget = (
  draft: ProgramDraft,
  index: number,
  step: number,
  target:
    | { pace: DraftStep['pace'] | null }
    | { heartRate: DraftStep['heartRate'] | null }
): ProgramDraft =>
  setWorkout(draft, index, (workout) => {
    const current = workout.steps[step];
    if (!current) return workout;
    const next: DraftStep = { ...current };
    if ('pace' in target) {
      if (target.pace) next.pace = target.pace;
      else delete next.pace;
    } else if (target.heartRate) {
      next.heartRate = target.heartRate;
    } else {
      delete next.heartRate;
    }
    return { ...workout, steps: replaceAt(workout.steps, step, next) };
  });
