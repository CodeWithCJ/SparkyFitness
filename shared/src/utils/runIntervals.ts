/**
 * Interval plans for a GPS recording (run/walk programs, 5 x 3 min repeats,
 * 6 x 400 m). Pure, so it runs under Jest; the recording service owns the
 * state between calls and reads the position from the recording's active clock
 * and distance, which stop while paused, so a pause never eats into a step.
 */

import { normalizePaceBand, type PaceBand } from './paceTargets.ts';
import {
  normalizeHeartRateBand,
  type HeartRateBand,
} from './heartRateTargets.ts';

export type IntervalStepKind = 'warmup' | 'work' | 'recovery' | 'cooldown';

/**
 * What a stretch is for, where its kind alone does not say: an easy run in a
 * run/walk plan, a stride, a tempo or marathon-pace effort, a hill repeat, or a
 * steady Zone 2 run. A step with none is just a fast stretch (work) or an easy
 * one (recovery). It decides which pace and heart-rate range a step gets.
 */
export type StepEffort =
  'easy' | 'stride' | 'tempo' | 'marathon' | 'hill' | 'zone2';

export const STEP_EFFORTS: readonly StepEffort[] = [
  'easy',
  'stride',
  'tempo',
  'marathon',
  'hill',
  'zone2',
];

/**
 * The unit a distance step was set in, which is how it is shown and spoken:
 * metres (short track repeats, the default) or miles.
 */
export type StepDistanceUnit = 'm' | 'mi';

export const STEP_METERS_PER_MILE = 1609.344;

/**
 * How the steps are spoken: a run/walk plan says "Run" and "Walk", a speed
 * session says "Fast" and "Easy", and a brisk walk says "Brisk" and "Easy".
 */
export type IntervalStyle = 'runWalk' | 'fastEasy' | 'briskWalk';

export interface IntervalStep {
  kind: IntervalStepKind;
  /**
   * How long the step lasts. On a distance step this is only the expected
   * time, used for plan totals and followed by builds that predate distance
   * steps; the step itself ends at `meters`.
   */
  seconds: number;
  /** A distance step: it ends once this many metres have been recorded in it. */
  meters?: number;
  /** Pace range to hold during this step; absent means no target. */
  pace?: PaceBand;
  /** Heart-rate range to hold during this step; absent means no target. */
  heartRate?: HeartRateBand;
  /** How a distance step is shown and spoken; metres when absent. */
  unit?: StepDistanceUnit;
  /** What the stretch is for, which picks its pace range; absent means just fast or easy. */
  effort?: StepEffort;
}

export interface IntervalPlan {
  style: IntervalStyle;
  steps: IntervalStep[];
}

export interface IntervalOptions {
  style: IntervalStyle;
  warmupSeconds: number;
  workSeconds: number;
  /** When set, each work step is this distance instead of `workSeconds`. */
  workMeters?: number;
  /** The unit `workMeters` was set in; metres when absent. */
  workUnit?: StepDistanceUnit;
  recoverySeconds: number;
  rounds: number;
  cooldownSeconds: number;
}

export const MAX_INTERVAL_ROUNDS = 30;
export const MAX_STEP_SECONDS = 3600;
/** A longest step inside a stored program plan: a long run is one step. */
export const MAX_PROGRAM_STEP_SECONDS = 4 * 3600;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

export const MIN_STEP_METERS = 50;
export const MAX_STEP_METERS = 50_000;
/**
 * Expected time per metre for a distance step (6:00 per km). Only used for
 * plan totals and as the fallback length on a build that cannot follow
 * distance, so a rough figure is fine.
 */
export const EXPECTED_SECONDS_PER_METER = 0.36;

export const isDistanceStep = (step: IntervalStep): boolean =>
  typeof step.meters === 'number' && step.meters > 0;

/** Whether any step ends on distance, which needs GPS (or the watch's GPS). */
export const planHasDistanceSteps = (plan: IntervalPlan): boolean =>
  plan.steps.some(isDistanceStep);

/** A step of `meters`, with its expected time, set in `unit`. */
export function distanceStep(
  kind: IntervalStepKind,
  meters: number,
  unit?: StepDistanceUnit
): IntervalStep {
  const m = clamp(meters, MIN_STEP_METERS, MAX_STEP_METERS);
  return {
    kind,
    meters: m,
    seconds: clamp(m * EXPECTED_SECONDS_PER_METER, 5, MAX_PROGRAM_STEP_SECONDS),
    ...(unit === 'mi' ? { unit } : {}),
  };
}

/**
 * Builds a plan: an optional warm-up, `rounds` of work then recovery (no
 * recovery after the last round when a cool-down follows, since the cool-down
 * is the easy stretch), and an optional cool-down.
 */
export function buildIntervalPlan(options: IntervalOptions): IntervalPlan {
  const rounds = clamp(options.rounds, 1, MAX_INTERVAL_ROUNDS);
  const work = clamp(options.workSeconds, 5, MAX_STEP_SECONDS);
  const workStep: IntervalStep =
    options.workMeters !== undefined && options.workMeters > 0
      ? distanceStep('work', options.workMeters, options.workUnit)
      : { kind: 'work', seconds: work };
  const recovery = clamp(options.recoverySeconds, 0, MAX_STEP_SECONDS);
  const warmup = clamp(options.warmupSeconds, 0, MAX_STEP_SECONDS);
  const cooldown = clamp(options.cooldownSeconds, 0, MAX_STEP_SECONDS);
  const steps: IntervalStep[] = [];
  if (warmup > 0) steps.push({ kind: 'warmup', seconds: warmup });
  for (let round = 1; round <= rounds; round++) {
    steps.push({ ...workStep });
    const last = round === rounds;
    if (recovery > 0 && !(last && cooldown > 0)) {
      steps.push({ kind: 'recovery', seconds: recovery });
    }
  }
  if (cooldown > 0) steps.push({ kind: 'cooldown', seconds: cooldown });
  return { style: options.style, steps };
}

export interface IntervalPreset {
  /** Stable id, also used as the translation key suffix. */
  id: string;
  options: IntervalOptions;
}

const MIN = 60;

// The first week of a typical beginner run/walk program, and a few common
// speed sessions, two of them on distance. These are only starting points:
// Custom covers anything else.
export const INTERVAL_PRESETS: readonly IntervalPreset[] = [
  {
    id: 'beginnerRunWalk',
    options: {
      style: 'runWalk',
      warmupSeconds: 5 * MIN,
      workSeconds: 60,
      recoverySeconds: 90,
      rounds: 8,
      cooldownSeconds: 5 * MIN,
    },
  },
  {
    id: 'runWalk2',
    options: {
      style: 'runWalk',
      warmupSeconds: 5 * MIN,
      workSeconds: 2 * MIN,
      recoverySeconds: 2 * MIN,
      rounds: 6,
      cooldownSeconds: 5 * MIN,
    },
  },
  {
    id: 'runWalk5',
    options: {
      style: 'runWalk',
      warmupSeconds: 5 * MIN,
      workSeconds: 5 * MIN,
      recoverySeconds: 2 * MIN,
      rounds: 3,
      cooldownSeconds: 5 * MIN,
    },
  },
  {
    id: 'short400',
    options: {
      style: 'fastEasy',
      warmupSeconds: 10 * MIN,
      workSeconds: 90,
      recoverySeconds: 90,
      rounds: 8,
      cooldownSeconds: 10 * MIN,
    },
  },
  {
    id: 'threeMinutes',
    options: {
      style: 'fastEasy',
      warmupSeconds: 10 * MIN,
      workSeconds: 3 * MIN,
      recoverySeconds: 2 * MIN,
      rounds: 5,
      cooldownSeconds: 10 * MIN,
    },
  },
  {
    id: 'fourByFour',
    options: {
      style: 'fastEasy',
      warmupSeconds: 10 * MIN,
      workSeconds: 4 * MIN,
      recoverySeconds: 3 * MIN,
      rounds: 4,
      cooldownSeconds: 10 * MIN,
    },
  },
  {
    id: 'sixBy400m',
    options: {
      style: 'fastEasy',
      warmupSeconds: 10 * MIN,
      workSeconds: 90,
      workMeters: 400,
      recoverySeconds: 90,
      rounds: 6,
      cooldownSeconds: 10 * MIN,
    },
  },
  {
    id: 'fiveBy1k',
    options: {
      style: 'fastEasy',
      warmupSeconds: 10 * MIN,
      workSeconds: 5 * MIN,
      workMeters: 1000,
      recoverySeconds: 2 * MIN,
      rounds: 5,
      cooldownSeconds: 10 * MIN,
    },
  },
];

export const planTotalSeconds = (plan: IntervalPlan): number =>
  plan.steps.reduce((sum, step) => sum + step.seconds, 0);

export interface IntervalPosition {
  /** Index into `plan.steps`; the last index once the plan is done. */
  index: number;
  step: IntervalStep;
  /** Seconds into the current step. */
  elapsedInStep: number;
  /** Seconds left in a timed step (0 on a distance step, and once done). */
  remaining: number;
  /** Metres left in a distance step; null on a timed step. */
  remainingMeters: number | null;
  /** How much of the step is done, 0 to 1. */
  fraction: number;
  /** The step after this one, or null on the last. */
  next: IntervalStep | null;
  /** Which work round this is (the nearest one for warm-up and cool-down). */
  round: number;
  rounds: number;
  /** Every step is finished; the person is free to carry on or stop. */
  done: boolean;
}

/**
 * Where the current step began, in active seconds and recorded metres.
 * `index` is `plan.steps.length` once the plan is done. A distance step's end
 * cannot be worked out from the clock alone, so the recording keeps this
 * between calls and moves it on with `advanceIntervalCursor`.
 */
export interface IntervalCursor {
  index: number;
  startSeconds: number;
  startMeters: number;
}

export const INITIAL_INTERVAL_CURSOR: IntervalCursor = {
  index: 0,
  startSeconds: 0,
  startMeters: 0,
};

/**
 * Moves `cursor` past every step that has ended by `activeSeconds` and
 * `activeMeters`. `started` lists each step begun on the way (the last entry
 * has `index === plan.steps.length` when the plan finished), with when it
 * began: a timed step ends exactly on the clock, a distance step at the
 * reading that crossed its distance. How far had been covered when a timed
 * step ended is not known here, so the next step starts at `activeMeters`:
 * call this often (the recording does every second and with each batch of
 * fixes), or a distance step after a long gap counts only from the call.
 */
export function advanceIntervalCursor(
  plan: IntervalPlan,
  cursor: IntervalCursor | null | undefined,
  activeSeconds: number,
  activeMeters: number
): { cursor: IntervalCursor; started: IntervalCursor[] } {
  const at = Math.max(0, activeSeconds);
  const meters = Math.max(0, activeMeters);
  let current = cursor ?? INITIAL_INTERVAL_CURSOR;
  const started: IntervalCursor[] = [];
  while (current.index < plan.steps.length) {
    const step = plan.steps[current.index];
    if (!step) break;
    let next: IntervalCursor;
    if (isDistanceStep(step)) {
      const end = current.startMeters + (step.meters ?? 0);
      if (meters < end) break;
      next = { index: current.index + 1, startSeconds: at, startMeters: end };
    } else {
      const end = current.startSeconds + step.seconds;
      if (at < end) break;
      next = {
        index: current.index + 1,
        startSeconds: end,
        startMeters: meters,
      };
    }
    started.push(next);
    current = next;
  }
  return { cursor: current, started };
}

/**
 * Where the plan stands after `activeSeconds` of recorded (unpaused) time.
 * A plan with distance steps needs `progress`: the stored cursor and the
 * metres recorded so far. Without it the clock alone decides, which is exact
 * for a timed plan.
 */
export function intervalPosition(
  plan: IntervalPlan,
  activeSeconds: number,
  progress?: { cursor: IntervalCursor | null | undefined; meters: number }
): IntervalPosition | null {
  if (plan.steps.length === 0) return null;
  const at = Math.max(0, activeSeconds);
  const meters = Math.max(0, progress?.meters ?? 0);
  const { cursor } = advanceIntervalCursor(plan, progress?.cursor, at, meters);
  const rounds = plan.steps.filter((s) => s.kind === 'work').length;
  const roundAt = (index: number) =>
    Math.max(
      1,
      plan.steps.slice(0, index + 1).filter((s) => s.kind === 'work').length
    );
  const step = plan.steps[cursor.index];
  if (!step) {
    const lastIndex = plan.steps.length - 1;
    const lastStep = plan.steps[lastIndex];
    if (!lastStep) return null;
    return {
      index: lastIndex,
      step: lastStep,
      elapsedInStep: lastStep.seconds,
      remaining: 0,
      remainingMeters: isDistanceStep(lastStep) ? 0 : null,
      fraction: 1,
      next: null,
      round: Math.max(1, rounds),
      rounds,
      done: true,
    };
  }
  const elapsedInStep = Math.max(0, at - cursor.startSeconds);
  const distance = isDistanceStep(step);
  const stepMeters = step.meters ?? 0;
  const remainingMeters = distance
    ? Math.max(0, cursor.startMeters + stepMeters - meters)
    : null;
  const remaining = distance ? 0 : Math.max(0, step.seconds - elapsedInStep);
  const fraction = distance
    ? Math.min(1, 1 - (remainingMeters ?? 0) / stepMeters)
    : Math.min(1, elapsedInStep / step.seconds);
  return {
    index: cursor.index,
    step,
    elapsedInStep,
    remaining,
    remainingMeters,
    fraction,
    next: plan.steps[cursor.index + 1] ?? null,
    round: roundAt(cursor.index),
    rounds,
    done: false,
  };
}

/**
 * Active seconds at which step `index` begins, counting each distance step at
 * its expected time. Exact only for a timed plan.
 */
export function stepStartSeconds(plan: IntervalPlan, index: number): number {
  let start = 0;
  for (let i = 0; i < index && i < plan.steps.length; i++) {
    start += plan.steps[i]?.seconds ?? 0;
  }
  return start;
}

/** Checks a plan read back from storage or built by hand. */
export function isValidIntervalPlan(value: unknown): value is IntervalPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as IntervalPlan;
  return (
    (plan.style === 'runWalk' ||
      plan.style === 'fastEasy' ||
      plan.style === 'briskWalk') &&
    Array.isArray(plan.steps) &&
    plan.steps.length > 0 &&
    plan.steps.length <= 200 &&
    plan.steps.every(
      (step) =>
        ['warmup', 'work', 'recovery', 'cooldown'].includes(step.kind) &&
        Number.isFinite(step.seconds) &&
        step.seconds > 0 &&
        step.seconds <= MAX_PROGRAM_STEP_SECONDS &&
        (step.meters === undefined ||
          (Number.isFinite(step.meters) &&
            step.meters >= MIN_STEP_METERS &&
            step.meters <= MAX_STEP_METERS)) &&
        (step.unit === undefined || step.unit === 'm' || step.unit === 'mi') &&
        (step.effort === undefined || STEP_EFFORTS.includes(step.effort)) &&
        (step.pace === undefined || normalizePaceBand(step.pace) !== null) &&
        (step.heartRate === undefined ||
          normalizeHeartRateBand(step.heartRate) !== null)
    )
  );
}

/** Whether the last step has begun, i.e. the person got through the plan. */
export const lastStepStarted = (
  intervals: { plan: IntervalPlan; cued: number } | undefined
): boolean => !!intervals && intervals.cued >= intervals.plan.steps.length - 1;

/**
 * The plan with a pace range on its fast and easy stretches: `work` goes on
 * every work step, `easy` on every recovery step and `warm` on the warm-up and
 * cool-down. A step left without a range is not judged by the plan. A band
 * that is not usable is ignored.
 *
 * A work or recovery step with an `effort` gets the range for that effort
 * instead: `byEffort` names it. An `easy` effort with none follows its kind
 * like an untagged step, and any other effort with no range of its own gets
 * none, so a stride or hill repeat is never held to the pace of a long fast
 * stretch.
 */
export function applyPaceTargets(
  plan: IntervalPlan,
  targets: {
    work?: PaceBand | null;
    easy?: PaceBand | null;
    warm?: PaceBand | null;
    byEffort?: Partial<Record<StepEffort, PaceBand | null>>;
  }
): IntervalPlan {
  const work = normalizePaceBand(targets.work);
  const easy = normalizePaceBand(targets.easy);
  const warm = normalizePaceBand(targets.warm);
  const byEffort: Partial<Record<StepEffort, PaceBand>> = {};
  for (const effort of STEP_EFFORTS) {
    const band = normalizePaceBand(targets.byEffort?.[effort]);
    if (band) byEffort[effort] = band;
  }
  if (!work && !easy && !warm && Object.keys(byEffort).length === 0) {
    return plan;
  }
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      let pace: PaceBand | null;
      if (step.kind !== 'work' && step.kind !== 'recovery') {
        pace = warm;
      } else {
        const byKind = step.kind === 'work' ? work : easy;
        if (step.effort && byEffort[step.effort]) {
          pace = byEffort[step.effort] ?? null;
        } else if (step.effort && step.effort !== 'easy') {
          pace = null;
        } else {
          pace = byKind;
        }
      }
      return pace ? { ...step, pace } : step;
    }),
  };
}

/**
 * The same for heart rate: `work` goes on every work step, `easy` on every
 * recovery step and `warm` on the warm-up and cool-down. A Zone 2 step gets
 * `zone2` and nothing else, so it is never held to the hard range; without a
 * `zone2` range it has no target and is run by the talk test.
 */
export function applyHeartRateTargets(
  plan: IntervalPlan,
  targets: {
    work?: HeartRateBand | null;
    easy?: HeartRateBand | null;
    warm?: HeartRateBand | null;
    zone2?: HeartRateBand | null;
  }
): IntervalPlan {
  const work = normalizeHeartRateBand(targets.work);
  const easy = normalizeHeartRateBand(targets.easy);
  const warm = normalizeHeartRateBand(targets.warm);
  const zone2 = normalizeHeartRateBand(targets.zone2);
  if (!work && !easy && !warm && !zone2) return plan;
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      let heartRate: HeartRateBand | null;
      if (step.kind !== 'work' && step.kind !== 'recovery') {
        heartRate = warm;
      } else if (step.effort === 'zone2') {
        heartRate = zone2;
      } else if (step.effort === 'stride' || step.effort === 'hill') {
        // Heart rate lags a short effort, so strides and hill repeats get none.
        heartRate = null;
      } else if (step.effort === 'tempo' || step.effort === 'marathon') {
        // A tempo or marathon-pace effort is held to the hard range.
        heartRate = work;
      } else {
        heartRate = step.kind === 'work' ? work : easy;
      }
      return heartRate ? { ...step, heartRate } : step;
    }),
  };
}
