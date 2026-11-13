import {
  ExerciseProgressionConfig,
  LastExercisePerformance,
  ProgressionEvaluationResult,
} from '../types/progression.ts';

/**
 * Two decimals: enough for any plate step in kg or lb, and it keeps float
 * noise from adding a weight and an increment (92.8 + 2.5) out of the
 * suggestion and the message it is quoted in.
 */
function roundSuggestedWeight(weight: number): number {
  return Math.round(weight * 100) / 100;
}

export function evaluateProgression(
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

  const effectiveRepGoal = config.repGoal ?? config.targetSets * 8;

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
 * working sets with earlier sets taking the remainder.
 */
export function distributeProgressionReps(
  result: ProgressionEvaluationResult | null,
  progressionMode: ExerciseProgressionConfig['progressionMode'],
  workingSetCount: number
): number[] | null {
  if (
    result == null ||
    !result.goalAchieved ||
    result.status !== 'PROGRESSION_REPS_INCREASE' ||
    workingSetCount <= 0
  ) {
    return null;
  }
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
