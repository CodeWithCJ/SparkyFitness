import {
  intervalPosition,
  isDistanceStep,
  planHasDistanceSteps,
  planTotalSeconds,
  type IntervalCursor,
  type IntervalPlan,
  type IntervalStep,
} from '@workspace/shared';

/** What has already been said, kept with the session so a restore never repeats it. */
export interface CoachingState {
  /** Check-ins already given (the one due at `n * minutes`). */
  checkIns: number;
  /** Index of the last step whose "ten seconds" warning was given; -1 for none. */
  warnedStep: number;
  halfway: boolean;
  lastMinute: boolean;
  /** Index of the last step whose "three, two, one" was said; -1 for none. */
  countdownStep: number;
  /** How many of `RACE_MILESTONES_METERS` have been passed and said. */
  milestones: number;
}

export const INITIAL_COACHING_STATE: CoachingState = {
  checkIns: 0,
  warnedStep: -1,
  halfway: false,
  lastMinute: false,
  countdownStep: -1,
  milestones: 0,
};

/** Seconds before a step ends at which "three, two, one" is said. */
export const STEP_COUNTDOWN_SECONDS = 3;

/**
 * Distances worth a word when passed, whatever the unit: 5K, 10K, a half
 * marathon and a marathon. Split cues already mark every kilometer or mile.
 */
export const RACE_MILESTONES_METERS = [5000, 10000, 21097.5, 42195] as const;

/** The spoken check-in intervals offered, in minutes; 0 is off. */
export const CHECK_IN_CHOICES = [0, 5, 10, 15] as const;

/** Seconds before a step ends at which the warning is given. */
export const STEP_WARNING_SECONDS = 10;
/** Steps shorter than this get no warning: it would land right after their start cue. */
export const MIN_WARNED_STEP_SECONDS = 30;
/** Plans shorter than this get no halfway call. */
export const MIN_HALFWAY_PLAN_SECONDS = 5 * 60;
/** Plans shorter than this get no last-minute call. */
export const MIN_LAST_MINUTE_PLAN_SECONDS = 3 * 60;

export type CoachingCue =
  | { kind: 'stepCountdown' }
  | { kind: 'stepWarning'; next: IntervalStep | null }
  | { kind: 'milestone'; meters: number }
  | { kind: 'lastMinute' }
  | { kind: 'halfway' }
  | { kind: 'checkIn'; minutes: number };

/**
 * Works out which coaching cues are due at `elapsedSeconds` of recorded time
 * and the state after them. Returns the cues most important first; the caller
 * speaks the first and drops the rest, which are marked said here so a late
 * one never plays a minute out of date. Pure.
 */
export function nextCoachingCues(input: {
  elapsedSeconds: number;
  plan: IntervalPlan | null;
  /** Minutes between spoken check-ins; 0 or null for none. */
  checkInMinutes: number | null;
  /** Metres recorded so far; null indoors, where the distance is only an estimate. */
  distanceMeters?: number | null;
  /**
   * Where a plan with distance steps stands: its stored cursor and the metres
   * recorded in the plan so far. Without it the clock alone places the plan.
   */
  progress?: { cursor: IntervalCursor | null | undefined; meters: number };
  state: CoachingState;
}): { cues: CoachingCue[]; state: CoachingState } {
  const { elapsedSeconds, plan, checkInMinutes, distanceMeters } = input;
  // A state saved before the countdown and milestones existed lacks them.
  let state: CoachingState = { ...INITIAL_COACHING_STATE, ...input.state };
  const cues: CoachingCue[] = [];

  if (plan) {
    const position = intervalPosition(plan, elapsedSeconds, input.progress);
    if (
      position &&
      !position.done &&
      !isDistanceStep(position.step) &&
      position.step.seconds >= MIN_WARNED_STEP_SECONDS &&
      position.remaining <= STEP_COUNTDOWN_SECONDS &&
      position.index > state.countdownStep
    ) {
      cues.push({ kind: 'stepCountdown' });
      // The countdown is the more urgent: the ten-second warning is stale.
      state = {
        ...state,
        countdownStep: position.index,
        warnedStep: Math.max(state.warnedStep, position.index),
      };
    }
    if (
      position &&
      !position.done &&
      !isDistanceStep(position.step) &&
      position.step.seconds >= MIN_WARNED_STEP_SECONDS &&
      position.remaining <= STEP_WARNING_SECONDS &&
      position.index > state.warnedStep
    ) {
      cues.push({ kind: 'stepWarning', next: position.next });
      state = { ...state, warnedStep: position.index };
    }

    // A distance step has no fixed length, so the plan's length is only a
    // guess: no halfway or last-minute call for it (its own "to go" cue says
    // when a step is nearly over).
    const total = planHasDistanceSteps(plan) ? 0 : planTotalSeconds(plan);
    if (
      !state.lastMinute &&
      total >= MIN_LAST_MINUTE_PLAN_SECONDS &&
      elapsedSeconds < total &&
      total - elapsedSeconds <= 60
    ) {
      cues.push({ kind: 'lastMinute' });
      state = { ...state, lastMinute: true };
    }
    if (
      !state.halfway &&
      total >= MIN_HALFWAY_PLAN_SECONDS &&
      elapsedSeconds >= total / 2 &&
      elapsedSeconds < total
    ) {
      cues.push({ kind: 'halfway' });
      state = { ...state, halfway: true };
    }
  }

  if (distanceMeters != null && distanceMeters > 0) {
    const passed = RACE_MILESTONES_METERS.filter(
      (meters) => distanceMeters >= meters
    ).length;
    if (passed > state.milestones) {
      // Several at once (a gap in the fixes): say only the furthest.
      cues.push({
        kind: 'milestone',
        meters: RACE_MILESTONES_METERS[passed - 1],
      });
      state = { ...state, milestones: passed };
    }
  }

  if (checkInMinutes && checkInMinutes > 0) {
    const due = Math.floor(elapsedSeconds / (checkInMinutes * 60));
    if (due > state.checkIns) {
      cues.push({ kind: 'checkIn', minutes: due * checkInMinutes });
      state = { ...state, checkIns: due };
    }
  }

  return { cues, state };
}
