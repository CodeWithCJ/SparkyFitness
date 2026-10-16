import type { ProgramWorkout } from "./runPrograms.ts";
import {
  EXPECTED_SECONDS_PER_METER,
  isDistanceStep,
  MAX_STEP_METERS,
  MIN_STEP_METERS,
  type IntervalStep,
} from "./runIntervals.ts";

/**
 * Changes to a person's run program that keep it safe: only workouts not yet
 * done are touched, running time can come down a lot but only go up a little
 * at a time, and every change says what it did. Pure, so the REST route, the
 * AI tool and tests share one set of rules.
 */

export const MAX_EASE_PERCENT = 30;
export const MAX_PUSH_PERCENT = 10;
/** The most workouts one adjustment may touch. */
export const MAX_ADJUST_WORKOUTS = 9;
const MIN_RUN_SECONDS = 15;
const MAX_RUN_SECONDS = 4 * 3600;

export interface ProgramState {
  workouts: ProgramWorkout[];
  /** Index of the next workout. */
  next: number;
}

export interface AdjustResult extends ProgramState {
  /** One line saying what changed, for the person and the change log. */
  summary: string;
}

export class ProgramAdjustError extends Error {}

const roundTo5 = (seconds: number): number => Math.round(seconds / 5) * 5;
const roundTo10 = (meters: number): number => Math.round(meters / 10) * 10;

/**
 * A distance step scaled by `factor`, kept within 30% under and 10% over
 * `was` (the original distance) when known. Its expected time follows.
 */
function scaleDistanceStep(
  step: IntervalStep,
  factor: number,
  was: number | null,
): IntervalStep {
  let meters = Math.min(
    MAX_STEP_METERS,
    Math.max(MIN_STEP_METERS, roundTo10((step.meters ?? 0) * factor)),
  );
  if (was !== null && was > 0) {
    meters = Math.min(
      roundTo10(was * (1 + MAX_PUSH_PERCENT / 100)),
      Math.max(roundTo10(was * (1 - MAX_EASE_PERCENT / 100)), meters),
    );
  }
  if (meters === step.meters) return step;
  return {
    ...step,
    meters,
    seconds: Math.max(
      5,
      Math.round(
        step.meters
          ? (step.seconds * meters) / step.meters
          : meters * EXPECTED_SECONDS_PER_METER,
      ),
    ),
  };
}

/** Index of the first workout of `week` (0-based), or -1. */
export function firstIndexOfWeek(
  workouts: readonly ProgramWorkout[],
  week: number,
): number {
  return workouts.findIndex((w) => w.week === week);
}

/** Goes back to the start of `week` to do it again. */
export function repeatWeek(state: ProgramState, week: number): AdjustResult {
  const index = firstIndexOfWeek(state.workouts, week);
  if (index < 0) throw new ProgramAdjustError(`There is no week ${week + 1}.`);
  return {
    ...state,
    next: index,
    summary: `Repeating week ${week + 1}.`,
  };
}

/** Moves to workout `index`, clamped to the program. */
export function moveTo(state: ProgramState, index: number): AdjustResult {
  const next = Math.min(state.workouts.length, Math.max(0, Math.floor(index)));
  const workout = state.workouts[next];
  return {
    ...state,
    next,
    summary: workout
      ? `Moved to week ${workout.week + 1}, run ${workout.day + 1}.`
      : "Moved to the end of the program.",
  };
}

/**
 * Makes the running in the next `count` workouts shorter (negative `percent`)
 * or a little longer (positive), leaving the walking, warm-up and cool-down.
 * A distance step changes its distance by the same rules as a timed step's
 * time. Workouts already done are never changed.
 *
 * With `baseline` (the program as first written), running time in a step can
 * never end up more than 30% under or 10% over the original, however many
 * adjustments are made, so repeated changes cannot compound.
 */
export function adjustRunning(
  state: ProgramState,
  percent: number,
  count: number,
  baseline?: readonly ProgramWorkout[],
): AdjustResult {
  if (!Number.isFinite(percent) || percent === 0) {
    throw new ProgramAdjustError("Give a non-zero percent change.");
  }
  if (percent < -MAX_EASE_PERCENT || percent > MAX_PUSH_PERCENT) {
    throw new ProgramAdjustError(
      `Running time can change by ${-MAX_EASE_PERCENT}% to +${MAX_PUSH_PERCENT}% at a time.`,
    );
  }
  const n = Math.min(
    MAX_ADJUST_WORKOUTS,
    Math.max(1, Math.floor(Number.isFinite(count) ? count : 1)),
  );
  const end = Math.min(state.workouts.length, state.next + n);
  if (state.next >= state.workouts.length) {
    throw new ProgramAdjustError("The program is finished: nothing to adjust.");
  }
  const factor = 1 + percent / 100;
  let changedWorkouts = 0;
  const workouts = state.workouts.map((workout, index) => {
    if (index < state.next || index >= end) return workout;
    const original = baseline?.[index];
    const comparable =
      original && original.plan.steps.length === workout.plan.steps.length;
    let changed = false;
    const steps = workout.plan.steps.map((step, stepIndex) => {
      if (step.kind !== "work") return step;
      if (isDistanceStep(step)) {
        const before = comparable ? original.plan.steps[stepIndex] : undefined;
        const scaled = scaleDistanceStep(
          step,
          factor,
          before && isDistanceStep(before) ? (before.meters ?? null) : null,
        );
        if (scaled !== step) changed = true;
        return scaled;
      }
      let seconds = Math.min(
        MAX_RUN_SECONDS,
        Math.max(MIN_RUN_SECONDS, roundTo5(step.seconds * factor)),
      );
      const was = comparable ? (original.plan.steps[stepIndex]?.seconds ?? null) : null;
      if (was !== null && was > 0) {
        seconds = Math.min(
          roundTo5(was * (1 + MAX_PUSH_PERCENT / 100)),
          Math.max(roundTo5(was * (1 - MAX_EASE_PERCENT / 100)), seconds),
        );
      }
      if (seconds !== step.seconds) changed = true;
      return { ...step, seconds };
    });
    if (!changed) return workout;
    changedWorkouts++;
    return { ...workout, plan: { ...workout.plan, steps } };
  });
  if (changedWorkouts === 0) {
    throw new ProgramAdjustError(
      "Nothing to change: the next workouts have no running time to adjust, or are already at the limit of how far they can be changed from the original plan.",
    );
  }
  return {
    workouts,
    next: state.next,
    summary: `${percent < 0 ? "Eased" : "Lengthened"} the running in ${changedWorkouts} of the next ${end - state.next} workout${end - state.next === 1 ? "" : "s"} by up to ${Math.abs(percent)}%.`,
  };
}
