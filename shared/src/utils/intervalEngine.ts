import type { WorkoutFormat } from '../schemas/api/WorkoutPresets.api.zod.ts';

export type IntervalPhaseKind = 'countdown' | 'work' | 'rest' | 'finished';

export interface IntervalPhase {
  kind: IntervalPhaseKind;
  phaseIndex: number;
  stepIndex: number | null;
  round: number;
  totalRounds: number | null;
  durationSec: number;
  startsAt: number; // absolute epoch ms
  endsAt: number; // absolute epoch ms
}

export interface IntervalEngineStep {
  exerciseName: string;
  durationSec?: number | null;
  restSec?: number | null;
  reps?: number | null;
}

export interface IntervalEngineConfig {
  format: WorkoutFormat;
  timeCapSeconds?: number | null;
  countdownSeconds?: number;
  steps: IntervalEngineStep[];
  tabataWorkSec?: number;
  tabataRestSec?: number;
  tabataRounds?: number;
  emomIntervalSec?: number;
  emomRounds?: number;
}

export const DEFAULT_TABATA_WORK_SEC = 20;
export const DEFAULT_TABATA_REST_SEC = 10;
export const DEFAULT_TABATA_ROUNDS = 8;
export const DEFAULT_EMOM_INTERVAL_SEC = 60;
export const DEFAULT_COUNTDOWN_SEC = 5;

/**
 * Builds the sequence of interval phases given configuration and a start timestamp.
 * All phase timestamps are absolute epoch milliseconds so backgrounding and resuming
 * resolve accurately without timer drift.
 */
export function buildIntervalPhases(
  config: IntervalEngineConfig,
  startTimestampMs: number
): IntervalPhase[] {
  const {
    format,
    timeCapSeconds,
    countdownSeconds = DEFAULT_COUNTDOWN_SEC,
    steps,
    tabataWorkSec = DEFAULT_TABATA_WORK_SEC,
    tabataRestSec = DEFAULT_TABATA_REST_SEC,
    tabataRounds = DEFAULT_TABATA_ROUNDS,
    emomIntervalSec = DEFAULT_EMOM_INTERVAL_SEC,
    emomRounds,
  } = config;

  const phases: IntervalPhase[] = [];
  let currentMs = startTimestampMs;
  let phaseIndex = 0;

  // 1. Lead-in Countdown Phase
  if (countdownSeconds > 0) {
    const endsAt = currentMs + countdownSeconds * 1000;
    phases.push({
      kind: 'countdown',
      phaseIndex: phaseIndex++,
      stepIndex: null,
      round: 1,
      totalRounds: null,
      durationSec: countdownSeconds,
      startsAt: currentMs,
      endsAt,
    });
    currentMs = endsAt;
  }

  if (
    steps.length === 0 &&
    format !== 'amrap' &&
    format !== 'for_time' &&
    format !== 'tabata' &&
    format !== 'emom'
  ) {
    return phases;
  }

  if (format === 'tabata') {
    const totalRounds = tabataRounds;
    for (let round = 1; round <= totalRounds; round++) {
      for (let sIdx = 0; sIdx < Math.max(1, steps.length); sIdx++) {
        const stepIdx = steps.length > 0 ? sIdx : null;
        // Work
        const workEnd = currentMs + tabataWorkSec * 1000;
        phases.push({
          kind: 'work',
          phaseIndex: phaseIndex++,
          stepIndex: stepIdx,
          round,
          totalRounds,
          durationSec: tabataWorkSec,
          startsAt: currentMs,
          endsAt: workEnd,
        });
        currentMs = workEnd;

        // Rest (even on last round)
        const restEnd = currentMs + tabataRestSec * 1000;
        phases.push({
          kind: 'rest',
          phaseIndex: phaseIndex++,
          stepIndex: stepIdx,
          round,
          totalRounds,
          durationSec: tabataRestSec,
          startsAt: currentMs,
          endsAt: restEnd,
        });
        currentMs = restEnd;
      }
    }
  } else if (format === 'emom') {
    // Determine total rounds for EMOM: from emomRounds, or derived from timeCapSeconds, or step count
    const totalRounds =
      emomRounds ??
      (timeCapSeconds != null
        ? Math.floor(timeCapSeconds / emomIntervalSec)
        : Math.max(1, steps.length));

    for (let round = 1; round <= totalRounds; round++) {
      const stepIdx = steps.length > 0 ? (round - 1) % steps.length : null;
      const step = stepIdx !== null ? steps[stepIdx] : null;
      const configuredWorkSec =
        step?.durationSec != null && step.durationSec > 0
          ? Math.min(step.durationSec, emomIntervalSec)
          : emomIntervalSec;

      const workEnd = currentMs + configuredWorkSec * 1000;
      phases.push({
        kind: 'work',
        phaseIndex: phaseIndex++,
        stepIndex: stepIdx,
        round,
        totalRounds,
        durationSec: configuredWorkSec,
        startsAt: currentMs,
        endsAt: workEnd,
      });
      currentMs = workEnd;

      const restSec = emomIntervalSec - configuredWorkSec;
      if (restSec > 0) {
        const restEnd = currentMs + restSec * 1000;
        phases.push({
          kind: 'rest',
          phaseIndex: phaseIndex++,
          stepIndex: stepIdx,
          round,
          totalRounds,
          durationSec: restSec,
          startsAt: currentMs,
          endsAt: restEnd,
        });
        currentMs = restEnd;
      }
    }
  } else if (format === 'interval') {
    // Interval / HIIT: iterates over each step; work for durationSec, rest for restSec
    const totalSteps = steps.length;
    for (let sIdx = 0; sIdx < totalSteps; sIdx++) {
      const step = steps[sIdx];
      if (!step) continue;
      const workSec = step.durationSec ?? 30;
      const restSec = step.restSec ?? 0;

      const workEnd = currentMs + workSec * 1000;
      phases.push({
        kind: 'work',
        phaseIndex: phaseIndex++,
        stepIndex: sIdx,
        round: sIdx + 1,
        totalRounds: totalSteps,
        durationSec: workSec,
        startsAt: currentMs,
        endsAt: workEnd,
      });
      currentMs = workEnd;

      if (restSec > 0) {
        const restEnd = currentMs + restSec * 1000;
        phases.push({
          kind: 'rest',
          phaseIndex: phaseIndex++,
          stepIndex: sIdx,
          round: sIdx + 1,
          totalRounds: totalSteps,
          durationSec: restSec,
          startsAt: currentMs,
          endsAt: restEnd,
        });
        currentMs = restEnd;
      }
    }
  } else if (format === 'amrap') {
    // AMRAP: Runs against a global time cap. The work phase spans the entire cap.
    const capSec = timeCapSeconds ?? 1200; // 20 min default if unspecified
    const amrapEnd = currentMs + capSec * 1000;
    phases.push({
      kind: 'work',
      phaseIndex: phaseIndex++,
      stepIndex: null,
      round: 1,
      totalRounds: null,
      durationSec: capSec,
      startsAt: currentMs,
      endsAt: amrapEnd,
    });
    currentMs = amrapEnd;
  } else if (format === 'for_time') {
    // For Time: Open-ended or capped duration
    const capSec = timeCapSeconds ?? 3600; // 1 hr default cap
    const forTimeEnd = currentMs + capSec * 1000;
    phases.push({
      kind: 'work',
      phaseIndex: phaseIndex++,
      stepIndex: null,
      round: 1,
      totalRounds: 1,
      durationSec: capSec,
      startsAt: currentMs,
      endsAt: forTimeEnd,
    });
    currentMs = forTimeEnd;
  }

  return phases;
}

/**
 * Fast-forwards / resolves the active phase for a given timestamp.
 * Returns null if before start, or a synthetic phase if all phases ended.
 */
export function resolvePhaseAt(
  phases: IntervalPhase[],
  currentTimestampMs: number
): { phase: IntervalPhase | null; isFinished: boolean; remainingMs: number } {
  const firstPhase = phases[0];
  if (!firstPhase) {
    return { phase: null, isFinished: true, remainingMs: 0 };
  }

  if (currentTimestampMs < firstPhase.startsAt) {
    return {
      phase: firstPhase,
      isFinished: false,
      remainingMs: firstPhase.startsAt - currentTimestampMs,
    };
  }

  for (const phase of phases) {
    if (
      currentTimestampMs >= phase.startsAt &&
      currentTimestampMs < phase.endsAt
    ) {
      return {
        phase,
        isFinished: false,
        remainingMs: phase.endsAt - currentTimestampMs,
      };
    }
  }

  // All configured phases have concluded
  const lastPhase = phases[phases.length - 1];
  const round = lastPhase ? lastPhase.round : 0;
  const totalRounds = lastPhase ? lastPhase.totalRounds : 0;
  const endsAt = lastPhase ? lastPhase.endsAt : currentTimestampMs;

  return {
    phase: {
      kind: 'finished',
      phaseIndex: phases.length,
      stepIndex: null,
      round,
      totalRounds,
      durationSec: 0,
      startsAt: endsAt,
      endsAt,
    },
    isFinished: true,
    remainingMs: 0,
  };
}

/**
 * Shifts all subsequent phases forward by `pauseDurationMs` when unpausing.
 */
export function shiftPhasesForPause(
  phases: IntervalPhase[],
  activePhaseIndex: number,
  pauseDurationMs: number
): IntervalPhase[] {
  return phases.map((phase) => {
    if (phase.phaseIndex < activePhaseIndex) {
      return phase;
    }
    return {
      ...phase,
      startsAt: phase.startsAt + pauseDurationMs,
      endsAt: phase.endsAt + pauseDurationMs,
    };
  });
}
