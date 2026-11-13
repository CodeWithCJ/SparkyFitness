import type { TFunction } from 'i18next';
import {
  applyHeartRateTargets,
  applyPaceTargets,
  buildIntervalPlan,
  INTERVAL_PRESETS,
  type HeartRateBand,
  type IntervalPlan,
  type ProgramStatus,
} from '@workspace/shared';
import { programSpokenCues } from './programCues';
import { intervalStepName } from './recordingCues';
import type { RacePaceRanges } from './suggestedRanges';

/**
 * A plan the watch can follow on a wrist-only run, with the step names already
 * in the phone's language (the watch has no translations of its own).
 */
export interface WatchRunPlanPayload {
  /** Stable id: the program id, or the preset id. */
  id: string;
  name: string;
  /** Set for the program's workout due now; the phone ticks it off when the run is saved. */
  programId?: string;
  programIndex?: number;
  /** 'walk' for a walking program; missing is a run. */
  activity?: 'walk';
  /**
   * `meters` marks a distance step: the watch ends it on the distance it
   * records, and `seconds` is only the expected time (what a watch build
   * that predates distance steps follows instead).
   */
  /** Spoken ahead of a program workout's first step (place, length, any easing); the watch says it as is. */
  startText?: string;
  /** Spoken when a program workout reaches its end: progress and what is next. */
  doneText?: string;
  steps: {
    label: string;
    seconds: number;
    meters?: number;
    /** Pace range to hold in this step, seconds per km. */
    paceMin?: number;
    paceMax?: number;
    /** Heart-rate range to hold in this step, bpm. */
    hrMin?: number;
    hrMax?: number;
    /** 'mi' when the distance step was set in miles; metres otherwise. */
    unit?: 'mi';
  }[];
}

const programCueText = (
  t: TFunction,
  id: string,
  index: number,
  plan: IntervalPlan
): { startText?: string; doneText?: string } => {
  const cues = programSpokenCues(t, { id, index }, plan);
  return cues ? { startText: cues.start, doneText: cues.done } : {};
};

const toSteps = (t: TFunction, plan: IntervalPlan) =>
  plan.steps.map((step) => ({
    label: intervalStepName(t, step.kind, plan.style, step.effort),
    seconds: step.seconds,
    ...(step.meters !== undefined && step.meters > 0
      ? { meters: step.meters }
      : {}),
    ...(step.pace
      ? {
          paceMin: step.pace.minSecondsPerKm,
          paceMax: step.pace.maxSecondsPerKm,
        }
      : {}),
    ...(step.heartRate
      ? { hrMin: step.heartRate.minBpm, hrMax: step.heartRate.maxBpm }
      : {}),
    ...(step.unit === 'mi' ? { unit: 'mi' as const } : {}),
  }));

/**
 * The plans offered on the watch: the program workout due now (when a program
 * is on), then the built-in interval plans. `programName` and `presetName`
 * are injected so this stays free of the components that own the wording.
 * `paceRanges`, when given, put the person's race-based ranges on the program
 * workout's steps, so the watch holds them to it the way the phone does, and
 * `zone2Band` puts the person's Zone 2 heart-rate range on a Zone 2 workout's.
 */
export function buildWatchRunPlans(
  t: TFunction,
  program: { status: ProgramStatus | null; enabled: boolean },
  names: {
    program: (status: ProgramStatus) => string;
    preset: (id: string) => string;
  },
  paceRanges?: RacePaceRanges | null,
  zone2Band?: HeartRateBand | null
): WatchRunPlanPayload[] {
  const plans: WatchRunPlanPayload[] = [];
  const { status } = program;
  if (program.enabled && status?.workout && !status.finished) {
    plans.push({
      id: status.program.id,
      name: names.program(status),
      programId: status.program.id,
      programIndex: status.done,
      ...(status.program.activity === 'walk'
        ? { activity: 'walk' as const }
        : {}),
      ...programCueText(t, status.program.id, status.done, status.workout.plan),
      steps: toSteps(
        t,
        applyHeartRateTargets(
          paceRanges
            ? applyPaceTargets(status.workout.plan, {
                work: paceRanges.pair.work,
                easy: paceRanges.pair.easy,
                byEffort: paceRanges.byEffort,
              })
            : status.workout.plan,
          { zone2: zone2Band }
        )
      ),
    });
  }
  for (const preset of INTERVAL_PRESETS) {
    plans.push({
      id: preset.id,
      name: names.preset(preset.id),
      steps: toSteps(t, buildIntervalPlan(preset.options)),
    });
  }
  return plans;
}

/**
 * The plan chosen on the phone's Record screen, in the shape the watch takes
 * when the phone starts a run there. `program` marks it as the due program
 * workout so the finished run ticks it off.
 */
export function buildWatchStartPlan(
  t: TFunction,
  plan: IntervalPlan,
  meta: {
    id: string;
    name: string;
    program?: { id: string; index: number; activity: 'run' | 'walk' | 'ride' };
  }
): WatchRunPlanPayload {
  return {
    id: meta.id,
    name: meta.name,
    ...(meta.program
      ? {
          programId: meta.program.id,
          programIndex: meta.program.index,
          ...(meta.program.activity === 'walk'
            ? { activity: 'walk' as const }
            : {}),
          ...programCueText(t, meta.program.id, meta.program.index, plan),
        }
      : {}),
    steps: toSteps(t, plan),
  };
}
