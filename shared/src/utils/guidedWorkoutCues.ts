import type { ExerciseModality } from '../constants/exercise.ts';
import type { IntervalPhase } from './intervalEngine.ts';

/**
 * Guided workout narration (#1507). This module decides WHAT is said and
 * WHEN; it never produces display text. Each platform renders a cue through
 * its own `t()` so narration follows the app language, and speaks it with its
 * own engine (browser SpeechSynthesis on web, expo-speech on mobile).
 */

export const GUIDED_COUNTDOWN_MIN_SEC = 3;
export const GUIDED_COUNTDOWN_MAX_SEC = 15;
export const DEFAULT_GUIDED_COUNTDOWN_SEC = 5;

export const GUIDED_SPEECH_RATE_MIN = 0.5;
export const GUIDED_SPEECH_RATE_MAX = 2;
export const GUIDED_SPEECH_RATE_STEP = 0.25;
export const DEFAULT_GUIDED_SPEECH_RATE = 1;

/** Timed sets shorter than this skip "Halfway" so it never lands on the 3-2-1 beeps. */
export const GUIDED_HALFWAY_MIN_SEC = 10;

export function clampGuidedCountdownSec(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_GUIDED_COUNTDOWN_SEC;
  return Math.min(
    GUIDED_COUNTDOWN_MAX_SEC,
    Math.max(GUIDED_COUNTDOWN_MIN_SEC, Math.round(seconds))
  );
}

export function clampGuidedSpeechRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_GUIDED_SPEECH_RATE;
  const stepped =
    Math.round(rate / GUIDED_SPEECH_RATE_STEP) * GUIDED_SPEECH_RATE_STEP;
  return Math.min(
    GUIDED_SPEECH_RATE_MAX,
    Math.max(GUIDED_SPEECH_RATE_MIN, stepped)
  );
}

export type GuidedSetTarget =
  | { kind: 'time'; seconds: number }
  | { kind: 'reps'; reps: number }
  | { kind: 'open' };

/**
 * What a set asks for. Duration modalities are clock-driven when they carry a
 * positive duration; everything else is rep-driven, falling back to a
 * duration when a strength set has only that, and "open" when it has neither.
 * `duration` is integer seconds, as stored on sets.
 */
export function resolveGuidedSetTarget(
  modality: ExerciseModality,
  set: { reps?: number | null; duration?: number | null }
): GuidedSetTarget {
  const seconds = Number(set.duration) || 0;
  const reps = Number(set.reps) || 0;
  const durationLike =
    modality === 'duration' || modality === 'duration_distance';
  if (durationLike && seconds > 0) return { kind: 'time', seconds };
  if (reps > 0) return { kind: 'reps', reps };
  if (seconds > 0) return { kind: 'time', seconds };
  return { kind: 'open' };
}

export type GuidedCue =
  | { type: 'getReady'; exerciseName: string }
  | {
      type: 'setStart';
      exerciseName: string;
      target: GuidedSetTarget;
      setNumber: number;
      totalSets: number;
    }
  | { type: 'instruction'; text: string }
  | { type: 'halfway' }
  | { type: 'rest'; seconds: number }
  | { type: 'nextUp'; exerciseName: string }
  | { type: 'intervalRest' }
  | { type: 'workoutComplete' };

export interface GuidedSetInfo {
  exerciseName: string;
  target: GuidedSetTarget;
  /** 1-based position of this set within its exercise. */
  setNumber: number;
  totalSets: number;
  /** The exercise's instruction lines (library content, spoken verbatim). */
  instructions?: readonly string[] | null;
}

/** Instruction lines worth speaking: trimmed, empties dropped. */
export function normalizeGuidedInstructions(
  lines: readonly string[] | string | null | undefined
): string[] {
  if (!lines) return [];
  if (typeof lines === 'string') {
    try {
      const parsed = JSON.parse(lines);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((line): line is string => typeof line === 'string')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
      }
    } catch {
      // not JSON array
    }
    const trimmed = lines.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter((line) => line.length > 0);
}

/** Spoken once, as a guided session begins its first get-ready. */
export function buildGuidedSessionStartCues(first: GuidedSetInfo): GuidedCue[] {
  return [{ type: 'getReady', exerciseName: first.exerciseName }];
}

/**
 * Spoken as a set starts: the exercise and its target, then — on the first
 * set of an exercise only — every instruction line. The instructions run
 * alongside the set; the 3-2-1 beeps are separate audio and are not spoken.
 */
export function buildGuidedSetStartCues(set: GuidedSetInfo): GuidedCue[] {
  const cues: GuidedCue[] = [
    {
      type: 'setStart',
      exerciseName: set.exerciseName,
      target: set.target,
      setNumber: set.setNumber,
      totalSets: set.totalSets,
    },
  ];
  if (set.setNumber === 1) {
    for (const text of normalizeGuidedInstructions(set.instructions)) {
      cues.push({ type: 'instruction', text });
    }
  }
  return cues;
}

/**
 * The Replay button: the set's announcement and every instruction line again,
 * whichever set of the exercise it is. During a rest (`upNext`) it previews
 * the set coming next.
 */
export function buildGuidedReplayCues(
  set: GuidedSetInfo,
  upNext: boolean
): GuidedCue[] {
  const cues: GuidedCue[] = [
    {
      type: 'setStart',
      exerciseName: set.exerciseName,
      target: set.target,
      setNumber: set.setNumber,
      totalSets: set.totalSets,
    },
    ...normalizeGuidedInstructions(set.instructions).map((text): GuidedCue => ({
      type: 'instruction',
      text,
    })),
  ];
  return upNext
    ? [{ type: 'nextUp', exerciseName: set.exerciseName }, ...cues]
    : cues;
}

/** Spoken as a rest begins; announces what follows it when known. */
export function buildGuidedRestCues(
  restSeconds: number,
  next: { exerciseName: string } | null
): GuidedCue[] {
  const cues: GuidedCue[] = [];
  if (restSeconds > 0) {
    cues.push({ type: 'rest', seconds: Math.round(restSeconds) });
  }
  if (next) cues.push({ type: 'nextUp', exerciseName: next.exerciseName });
  return cues;
}

export function buildGuidedWorkoutCompleteCues(): GuidedCue[] {
  return [{ type: 'workoutComplete' }];
}

/**
 * True exactly once per timed set: when the remaining time first reaches
 * half. Callers keep `alreadySpoken` per set.
 */
export function shouldSpeakGuidedHalfway(
  durationSec: number,
  remainingSec: number,
  alreadySpoken: boolean
): boolean {
  if (alreadySpoken || durationSec < GUIDED_HALFWAY_MIN_SEC) return false;
  return remainingSec > 0 && remainingSec <= durationSec / 2;
}

/**
 * Narration for an interval-format phase change (Tabata/EMOM/HIIT/AMRAP/For
 * Time). The format's own chimes and 3-2-1 beeps are untouched; this only
 * adds speech on top.
 *
 * - work: the step's exercise (when the phase has one) and its target
 * - rest: "Rest", then the next work phase's exercise when it differs
 * - finished: "Workout complete"
 */
export function buildGuidedIntervalPhaseCues(
  phase: IntervalPhase,
  phases: readonly IntervalPhase[],
  getStep: (stepIndex: number) => {
    exerciseName: string;
    target: GuidedSetTarget;
  } | null
): GuidedCue[] {
  if (phase.kind === 'finished') return buildGuidedWorkoutCompleteCues();
  if (phase.kind === 'countdown') {
    const firstWork = phases.find((p) => p.kind === 'work');
    const step =
      firstWork?.stepIndex != null ? getStep(firstWork.stepIndex) : null;
    return step ? [{ type: 'getReady', exerciseName: step.exerciseName }] : [];
  }
  if (phase.kind === 'work') {
    const step = phase.stepIndex != null ? getStep(phase.stepIndex) : null;
    if (!step) return [];
    return [
      {
        type: 'setStart',
        exerciseName: step.exerciseName,
        // The phase clock owns the length, whatever the set says.
        target:
          step.target.kind === 'reps'
            ? step.target
            : { kind: 'time', seconds: phase.durationSec },
        setNumber: phase.round,
        totalSets: phase.totalRounds ?? 0,
      },
    ];
  }
  // rest
  const cues: GuidedCue[] = [{ type: 'intervalRest' }];
  const nextWork = phases.find(
    (p) => p.phaseIndex > phase.phaseIndex && p.kind === 'work'
  );
  if (nextWork?.stepIndex != null && nextWork.stepIndex !== phase.stepIndex) {
    const next = getStep(nextWork.stepIndex);
    if (next) cues.push({ type: 'nextUp', exerciseName: next.exerciseName });
  }
  return cues;
}
