import {
  ExerciseProgressionConfig,
  LastExercisePerformance,
  ProgressionEvaluationResult,
} from '../types/progression.ts';

/** Sessions in a row that miss the goal at one load before a deload. */
export const STALL_SESSIONS_BEFORE_DELOAD = 3;
/** How much a stall deload takes off, as a fraction of the load. */
export const STALL_DELOAD_FRACTION = 0.1;
/** Sets triple progression may add on top of the planned working sets. */
export const TRIPLE_PROGRESSION_EXTRA_SETS = 2;

/**
 * Two decimals: enough for any plate step in kg or lb, and it keeps float
 * noise from adding a weight and an increment (92.8 + 2.5) out of the
 * suggestion and the message it is quoted in.
 */
function roundSuggestedWeight(weight: number): number {
  return Math.round(weight * 100) / 100;
}

/**
 * Next session's target for one exercise from its last session.
 *
 * `earlierSessions` (newest first, not including `lastPerformance`) turns on
 * stall detection for modes that add weight: when the goal was missed
 * {@link STALL_SESSIONS_BEFORE_DELOAD} sessions in a row at the same load,
 * the suggestion becomes a deload of about {@link STALL_DELOAD_FRACTION},
 * rounded down to whole increments.
 */
export function evaluateProgression(
  config: ExerciseProgressionConfig,
  lastPerformance?: LastExercisePerformance | null,
  earlierSessions?: readonly LastExercisePerformance[]
): ProgressionEvaluationResult {
  const result = evaluateOneSession(config, lastPerformance);
  if (
    result.status !== 'MAINTAIN_TARGET' ||
    !lastPerformance ||
    !earlierSessions ||
    !addsWeight(config)
  ) {
    return result;
  }
  const base = lastPerformance.baseWeight;
  const needed = STALL_SESSIONS_BEFORE_DELOAD - 1;
  if (base <= 0 || earlierSessions.length < needed) return result;
  const stalled = earlierSessions
    .slice(0, needed)
    .every(
      (session) =>
        Math.abs(session.baseWeight - base) < 0.01 &&
        evaluateOneSession(config, session).status === 'MAINTAIN_TARGET'
    );
  if (!stalled) return result;
  const deloadWeight = deloadFrom(base, config.incrementValue);
  if (deloadWeight <= 0 || deloadWeight >= base) return result;
  return {
    ...result,
    status: 'DELOAD',
    suggestedWeight: deloadWeight,
    suggestedWeightChange: roundSuggestedWeight(deloadWeight - base),
    message: '',
    reason: {
      code: 'stall_deload',
      stalledSessions: STALL_SESSIONS_BEFORE_DELOAD,
      deloadPercent: Math.round(STALL_DELOAD_FRACTION * 100),
    },
  };
}

function addsWeight(config: ExerciseProgressionConfig): boolean {
  const mode = config.progressionMode ?? 'rep_goal';
  if (mode === 'double' || mode === 'triple') return true;
  if (mode === 'manual' || mode === 'step_load') return false;
  return config.incrementType === 'weight';
}

/** About 10% off, rounded down to whole increments so plates still work. */
function deloadFrom(base: number, increment: number): number {
  const drop = base * STALL_DELOAD_FRACTION;
  if (!(increment > 0)) return roundSuggestedWeight(base - drop);
  const steps = Math.max(1, Math.ceil(drop / increment - 1e-9));
  return roundSuggestedWeight(base - steps * increment);
}

/**
 * Double and triple progression over a per-set rep range. Every working set
 * at the top of the range moves the lifter on: triple adds a set until it has
 * {@link TRIPLE_PROGRESSION_EXTRA_SETS} extra, then both add load and drop
 * reps back to the bottom of the range. Otherwise the load holds and the aim
 * is the top of the range.
 */
function evaluateRange(
  config: ExerciseProgressionConfig,
  last: LastExercisePerformance
): ProgressionEvaluationResult {
  const repMax = config.repGoal ?? 12;
  const repMin = Math.min(
    config.repRangeMin ?? Math.max(1, repMax - 4),
    repMax
  );
  const validSets = last.sets.filter(
    (s) => s.completed !== false && s.reps > 0
  );
  const totalRepsAchieved = validSets.reduce((sum, s) => sum + s.reps, 0);
  const setsDone = validSets.length;
  const setsAtTop = validSets.filter((s) => s.reps >= repMax).length;
  const repDifference = totalRepsAchieved - config.targetSets * repMax;
  const allAtTop = setsDone >= config.targetSets && setsAtTop === setsDone;
  const shared = { totalRepsAchieved, repDifference, message: '' };
  const range = { repMin, repMax, sets: setsDone, setsAtTop };

  if (!allAtTop) {
    return {
      ...shared,
      goalAchieved: false,
      status: 'MAINTAIN_TARGET',
      suggestedWeight: last.baseWeight,
      suggestedRepGoal: repMax,
      reason: { code: 'range_climbing', ...range },
    };
  }

  const maxSets = config.targetSets + TRIPLE_PROGRESSION_EXTRA_SETS;
  if (config.progressionMode === 'triple' && setsDone < maxSets) {
    return {
      ...shared,
      goalAchieved: true,
      status: 'PROGRESSION_SET_INCREASE',
      suggestedWeight: last.baseWeight,
      suggestedRepGoal: repMin,
      suggestedSets: setsDone + 1,
      reason: { code: 'range_add_set', ...range },
    };
  }

  return {
    ...shared,
    goalAchieved: true,
    status: 'PROGRESSION_WEIGHT_INCREASE',
    suggestedWeight: roundSuggestedWeight(
      last.baseWeight + config.incrementValue
    ),
    suggestedRepGoal: repMin,
    suggestedSets: config.targetSets,
    reason: { code: 'range_top_reached', ...range },
  };
}

function evaluateOneSession(
  config: ExerciseProgressionConfig,
  lastPerformance?: LastExercisePerformance | null
): ProgressionEvaluationResult {
  if (config.progressionMode === 'manual') {
    return {
      goalAchieved: false,
      status: 'MANUAL',
      suggestedWeight: lastPerformance?.baseWeight ?? 0,
      suggestedRepGoal: config.repGoal ?? 0,
      totalRepsAchieved: 0,
      repDifference: 0,
      message: 'Manual progression mode.',
    };
  }

  const isRange =
    config.progressionMode === 'double' || config.progressionMode === 'triple';
  // Range modes count reps per set, the others a session total.
  const effectiveRepGoal = isRange
    ? (config.repGoal ?? 12)
    : (config.repGoal ?? config.targetSets * 8);

  if (
    !lastPerformance ||
    !lastPerformance.sets ||
    lastPerformance.sets.length === 0
  ) {
    return {
      goalAchieved: false,
      status: 'FIRST_SESSION',
      suggestedWeight: 0,
      suggestedRepGoal: effectiveRepGoal,
      totalRepsAchieved: 0,
      repDifference: -effectiveRepGoal,
      message: 'First session for this exercise. Establish baseline.',
    };
  }

  if (isRange) return evaluateRange(config, lastPerformance);

  const validSets = lastPerformance.sets.filter(
    (s) => s.completed !== false && s.reps > 0
  );
  const totalRepsAchieved = validSets.reduce((sum, s) => sum + s.reps, 0);

  let goalAchieved = false;
  let repDifference = 0;

  if (config.progressionMode === 'fixed') {
    const targetPerSet = config.repGoal ?? 8;
    const successfulSets = validSets.filter(
      (s) => s.reps >= targetPerSet
    ).length;
    goalAchieved =
      validSets.length >= config.targetSets &&
      successfulSets >= config.targetSets;
    repDifference = totalRepsAchieved - config.targetSets * targetPerSet;

    if (goalAchieved) {
      if (config.incrementType === 'weight') {
        const newWeight = roundSuggestedWeight(
          lastPerformance.baseWeight + config.incrementValue
        );
        return {
          goalAchieved: true,
          status: 'PROGRESSION_WEIGHT_INCREASE',
          suggestedWeight: newWeight,
          suggestedRepGoal: targetPerSet,
          totalRepsAchieved,
          repDifference,
          message: `All ${config.targetSets} sets reached ${targetPerSet} reps! Increase weight to ${newWeight}.`,
        };
      } else {
        const newRepGoal = targetPerSet + config.incrementValue;
        return {
          goalAchieved: true,
          status: 'PROGRESSION_REPS_INCREASE',
          suggestedWeight: lastPerformance.baseWeight,
          suggestedRepGoal: newRepGoal,
          totalRepsAchieved,
          repDifference,
          message: `All ${config.targetSets} sets reached ${targetPerSet} reps! Target increased to ${newRepGoal} reps per set.`,
        };
      }
    }

    return {
      goalAchieved: false,
      status: 'MAINTAIN_TARGET',
      suggestedWeight: lastPerformance.baseWeight,
      suggestedRepGoal: targetPerSet,
      totalRepsAchieved,
      repDifference,
      message: `${successfulSets}/${config.targetSets} sets reached ${targetPerSet} reps. Hold weight.`,
    };
  }

  // Handle 'rep_goal' and 'step_load' modes
  goalAchieved = totalRepsAchieved >= effectiveRepGoal;
  repDifference = totalRepsAchieved - effectiveRepGoal;

  if (goalAchieved) {
    // Mode: step_load -> Keeps weight locked and steps up the target rep count
    if (config.progressionMode === 'step_load') {
      const newRepGoal = effectiveRepGoal + config.incrementValue;
      return {
        goalAchieved: true,
        status: 'PROGRESSION_REPS_INCREASE',
        suggestedWeight: lastPerformance.baseWeight,
        suggestedRepGoal: newRepGoal,
        totalRepsAchieved,
        repDifference,
        message: `Step-load rep target met (${totalRepsAchieved}/${effectiveRepGoal} reps)! Target increased to ${newRepGoal} reps at current load.`,
      };
    }

    // Mode: rep_goal with weight increment
    if (config.incrementType === 'weight') {
      const newWeight = roundSuggestedWeight(
        lastPerformance.baseWeight + config.incrementValue
      );
      return {
        goalAchieved: true,
        status: 'PROGRESSION_WEIGHT_INCREASE',
        suggestedWeight: newWeight,
        suggestedRepGoal: effectiveRepGoal,
        totalRepsAchieved,
        repDifference,
        message: `Rep goal met (${totalRepsAchieved}/${effectiveRepGoal} reps)! Increasing weight to ${newWeight}.`,
      };
    }

    // Mode: rep_goal with rep increment
    const newRepGoal = effectiveRepGoal + config.incrementValue;
    return {
      goalAchieved: true,
      status: 'PROGRESSION_REPS_INCREASE',
      suggestedWeight: lastPerformance.baseWeight,
      suggestedRepGoal: newRepGoal,
      totalRepsAchieved,
      repDifference,
      message: `Rep goal met (${totalRepsAchieved}/${effectiveRepGoal} reps)! Target increased to ${newRepGoal} reps.`,
    };
  }

  return {
    goalAchieved: false,
    status: 'MAINTAIN_TARGET',
    suggestedWeight: lastPerformance.baseWeight,
    suggestedRepGoal: effectiveRepGoal,
    totalRepsAchieved,
    repDifference,
    message: `Goal not reached (${totalRepsAchieved}/${effectiveRepGoal} reps). Hold weight.`,
  };
}

/**
 * Per-working-set rep targets after a rep progression, or null when the
 * evaluation didn't raise reps. Fixed mode's suggested goal is already per
 * set; rep_goal and step_load suggest a session total, split evenly across the
 * working sets with earlier sets taking the remainder. Double and triple
 * progression reset every working set to the bottom of the range after they
 * add load or a set.
 */
export function distributeProgressionReps(
  result: ProgressionEvaluationResult | null,
  progressionMode: ExerciseProgressionConfig['progressionMode'],
  workingSetCount: number
): number[] | null {
  if (result == null || !result.goalAchieved || workingSetCount <= 0) {
    return null;
  }
  if (progressionMode === 'double' || progressionMode === 'triple') {
    return Array.from(
      { length: result.suggestedSets ?? workingSetCount },
      () => result.suggestedRepGoal
    );
  }
  if (result.status !== 'PROGRESSION_REPS_INCREASE') return null;
  if (progressionMode === 'fixed') {
    return Array.from(
      { length: workingSetCount },
      () => result.suggestedRepGoal
    );
  }
  const base = Math.floor(result.suggestedRepGoal / workingSetCount);
  const remainder = result.suggestedRepGoal % workingSetCount;
  return Array.from(
    { length: workingSetCount },
    (_, i) => base + (i < remainder ? 1 : 0)
  );
}
