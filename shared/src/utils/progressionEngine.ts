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
    const successfulSets = validSets.filter((s) => s.reps >= targetPerSet).length;
    goalAchieved = validSets.length >= config.targetSets && successfulSets >= config.targetSets;
    const totalTargetReps = config.targetSets * targetPerSet;
    repDifference = totalRepsAchieved - totalTargetReps;

    if (goalAchieved) {
      if (config.incrementType === "weight") {
        const newWeight = lastPerformance.baseWeight + config.incrementValue;
        return {
          goalAchieved: true,
          status: "PROGRESSION_WEIGHT_INCREASE",
          suggestedWeight: newWeight,
          suggestedRepGoal: targetPerSet,
          totalRepsAchieved,
          repDifference,
          message: `All ${config.targetSets} sets reached ${targetPerSet} reps! Increase weight to ${newWeight}.`,
        };
      }
    }

    return {
      goalAchieved: false,
      status: "MAINTAIN_TARGET",
      suggestedWeight: lastPerformance.baseWeight,
      suggestedRepGoal: targetPerSet,
      totalRepsAchieved,
      repDifference,
      message: `${successfulSets}/${config.targetSets} sets reached ${targetPerSet} reps. Hold weight.`,
    };
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