import {
  ADAPTIVE_HIGH_RPE,
  adaptiveWeightStepKg,
  applyAdaptiveLoadFactorKg,
  decideAdaptiveAdjustment,
  type AdaptiveReason,
} from './adaptiveCoaching.ts';
import { isWarmupSetType } from './dropSetCalculator.ts';
import type { ExerciseCoachingSignal } from '../schemas/api/WorkoutCoaching.api.zod.ts';

/**
 * Deterministic proposals for the planned weights of a saved workout plan:
 * which lifts to add a step to, which to lighten or hold, and why. Pure, so
 * the AI assistant proposes only what the rules produce and applies only what
 * they produced. It reuses the adaptive-coaching rules (pain, difficulty
 * feedback, logged effort) and adds one of its own: a lift whose planned
 * weight and reps were met in each of the last two sessions moves up a step.
 */

export interface PlanProposalSet {
  id: number | string;
  setType?: string | null;
  reps?: number | null;
  /** Planned weight, kg. */
  weight?: number | null;
}

export interface PlanProposalAssignment {
  assignmentId: number | string;
  exerciseId: string;
  exerciseName: string;
  modality?: string | null;
  sets: PlanProposalSet[];
}

export interface PerformedSet {
  setType?: string | null;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
}

export interface PerformedSession {
  day: string;
  sets: PerformedSet[];
}

export type PlanProposalReason = AdaptiveReason | 'hit_plan_twice' | 'stalled';

export interface PlanSetChange {
  setId: number | string;
  fromKg: number;
  toKg: number;
}

export interface PlanProposal {
  assignmentId: number | string;
  exerciseId: string;
  exerciseName: string;
  /** `hold` changes nothing: it is advice, not an edit. */
  kind: 'increase' | 'reduce' | 'hold';
  reason: PlanProposalReason;
  /** Offer ranked alternatives (repeated pain in this exercise). */
  suggestAlternative: boolean;
  setChanges: PlanSetChange[];
}

export interface PlanProposalInput {
  assignments: readonly PlanProposalAssignment[];
  /** Performed sessions per exercise id, newest first. */
  history: Readonly<Record<string, readonly PerformedSession[]>>;
  signals: Readonly<Record<string, ExerciseCoachingSignal | null | undefined>>;
  /** Exercises the training review reports as stalled. */
  stalledExerciseIds: readonly string[];
  unit: 'kg' | 'lbs';
}

/** Consecutive sessions that must meet the plan before it moves up. */
export const PLAN_PROGRESSION_SESSIONS = 2;
const WEIGHT_BASED_MODALITIES = new Set(['weight_reps']);
const EPSILON = 0.001;

function workingSets<T extends { setType?: string | null }>(
  sets: readonly T[]
): T[] {
  return sets.filter((set) => !isWarmupSetType(set.setType));
}

function plannedWorkingSets(assignment: PlanProposalAssignment) {
  return workingSets(assignment.sets).filter((set) => Number(set.weight) > 0);
}

/**
 * Whether a session met the plan: at least as many working sets, and the
 * heaviest sets each at the planned weight and reps (reps only when planned).
 */
function metPlan(
  planned: readonly PlanProposalSet[],
  session: PerformedSession
): boolean {
  const done = workingSets(session.sets)
    .filter((set) => Number(set.weight) > 0)
    .sort((a, b) => Number(b.weight) - Number(a.weight));
  if (done.length < planned.length) return false;
  const target = [...planned].sort(
    (a, b) => Number(b.weight) - Number(a.weight)
  );
  return target.every((set, i) => {
    const got = done[i]!;
    const repsOk =
      !(Number(set.reps) > 0) || Number(got.reps) >= Number(set.reps);
    return Number(got.weight) >= Number(set.weight) - EPSILON && repsOk;
  });
}

function averageRpe(session: PerformedSession): number | null {
  const values = workingSets(session.sets)
    .map((set) => set.rpe)
    .filter((rpe): rpe is number => rpe !== null && rpe !== undefined);
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function proposePlanChanges(input: PlanProposalInput): PlanProposal[] {
  const step = adaptiveWeightStepKg(input.unit);
  const proposals: PlanProposal[] = [];

  for (const assignment of input.assignments) {
    if (
      assignment.modality != null &&
      !WEIGHT_BASED_MODALITIES.has(assignment.modality)
    ) {
      continue;
    }
    const planned = plannedWorkingSets(assignment);
    if (planned.length === 0) continue;

    const base = {
      assignmentId: assignment.assignmentId,
      exerciseId: assignment.exerciseId,
      exerciseName: assignment.exerciseName,
    };
    const changesFor = (toKg: (fromKg: number) => number): PlanSetChange[] =>
      planned
        .map((set) => ({
          setId: set.id,
          fromKg: Number(set.weight),
          toKg: round4(toKg(Number(set.weight))),
        }))
        .filter((change) => change.toKg !== change.fromKg);

    const adjustment = decideAdaptiveAdjustment(
      input.signals[assignment.exerciseId]
    );
    if (adjustment.kind === 'reduce') {
      const setChanges = changesFor((w) =>
        applyAdaptiveLoadFactorKg(w, adjustment.loadFactor, input.unit)
      );
      proposals.push({
        ...base,
        kind: setChanges.length > 0 ? 'reduce' : 'hold',
        reason: adjustment.reason!,
        suggestAlternative: adjustment.suggestAlternative,
        setChanges,
      });
      continue;
    }
    if (adjustment.kind === 'hold') {
      proposals.push({
        ...base,
        kind: 'hold',
        reason: adjustment.reason!,
        suggestAlternative: false,
        setChanges: [],
      });
      continue;
    }
    if (adjustment.kind === 'increase') {
      proposals.push({
        ...base,
        kind: 'increase',
        reason: adjustment.reason!,
        suggestAlternative: false,
        setChanges: changesFor((w) => w + step),
      });
      continue;
    }

    if (input.stalledExerciseIds.includes(assignment.exerciseId)) {
      proposals.push({
        ...base,
        kind: 'hold',
        reason: 'stalled',
        suggestAlternative: false,
        setChanges: [],
      });
      continue;
    }

    const recent = (input.history[assignment.exerciseId] ?? []).slice(
      0,
      PLAN_PROGRESSION_SESSIONS
    );
    if (
      recent.length === PLAN_PROGRESSION_SESSIONS &&
      recent.every((session) => {
        const rpe = averageRpe(session);
        return (
          metPlan(planned, session) && (rpe === null || rpe < ADAPTIVE_HIGH_RPE)
        );
      })
    ) {
      proposals.push({
        ...base,
        kind: 'increase',
        reason: 'hit_plan_twice',
        suggestAlternative: false,
        setChanges: changesFor((w) => w + step),
      });
    }
  }
  return proposals;
}
