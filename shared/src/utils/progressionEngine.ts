import {
  ExerciseProgressionConfig,
  LastExercisePerformance,
  ProgressionEvaluationResult,
} from "../types/progression.ts";

export function evaluateProgression(
  config: ExerciseProgressionConfig,
  lastPerformance?: LastExercisePerformance | null
): ProgressionEvaluationResult {
  if (config.progressionMode === "manual") {
    return {
      goalAchieved: false,
      status: "MANUAL",
      suggestedWeight: lastPerformance?.baseWeight ?? 0,
      suggestedRepGoal: config.repGoal ?? 0,
      totalRepsAchieved: 0,
      repDifference: 0,
      message: "Manual progression mode.",
    };
  }

  const effectiveRepGoal = config.repGoal ?? (config.targetSets * 8);

  if (!lastPerformance || !lastPerformance.sets || lastPerformance.sets.length === 0) {
    return {
      goalAchieved: false,
      status: "FIRST_SESSION",
      suggestedWeight: 0,
      suggestedRepGoal: effectiveRepGoal,
      totalRepsAchieved: 0,
      repDifference: -effectiveRepGoal,
      message: "First session for this exercise. Establish baseline.",
    };
  }

  const validSets = lastPerformance.sets.filter((s) => s.completed !== false && s.reps > 0);
  const totalRepsAchieved = validSets.reduce((sum, s) => sum + s.reps, 0);

  let goalAchieved = false;
  let repDifference = 0;

  if (config.progressionMode === "fixed") {
    // Fixed mode: Every working set must reach or exceed the target per-set reps
    const targetPerSet = config.repGoal ?? 8;
    const allSetsHit = validSets.length >= config.targetSets && validSets.every((s) => s.reps >= targetPerSet);
    goalAchieved = allSetsHit;
    repDifference = validSets.filter((s) => s.reps >= targetPerSet).length - config.targetSets;
  } else {
    // 'rep_goal' & 'step_load': Cumulative total reps check
    goalAchieved = totalRepsAchieved >= effectiveRepGoal;
    repDifference = totalRepsAchieved - effectiveRepGoal;
  }

  if (goalAchieved) {
    if (config.incrementType === "weight" && config.progressionMode !== "step_load") {
      const newWeight = lastPerformance.baseWeight + config.incrementValue;
      return {
        goalAchieved: true,
        status: "PROGRESSION_WEIGHT_INCREASE",
        suggestedWeight: newWeight,
        suggestedRepGoal: effectiveRepGoal,
        totalRepsAchieved,
        repDifference,
        message: `Goal achieved! Increase weight to ${newWeight}.`,
      };
    } else {
      const newRepGoal = effectiveRepGoal + config.incrementValue;
      return {
        goalAchieved: true,
        status: "PROGRESSION_REPS_INCREASE",
        suggestedWeight: lastPerformance.baseWeight,
        suggestedRepGoal: newRepGoal,
        totalRepsAchieved,
        repDifference,
        message: `Goal achieved! Target increased to ${newRepGoal} reps.`,
      };
    }
  }

  return {
    goalAchieved: false,
    status: "MAINTAIN_TARGET",
    suggestedWeight: lastPerformance.baseWeight,
    suggestedRepGoal: effectiveRepGoal,
    totalRepsAchieved,
    repDifference,
    message: `Goal not reached (${totalRepsAchieved}/${effectiveRepGoal} reps). Hold weight.`,
  };
}