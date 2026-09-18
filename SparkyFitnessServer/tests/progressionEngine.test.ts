import { describe, it, expect } from 'vitest';
import {
  evaluateProgression,
  ExerciseProgressionConfig,
  LastExercisePerformance,
} from '@workspace/shared';

describe('Progression Engine - Unit Tests', () => {
  const standardWeightConfig: ExerciseProgressionConfig = {
    targetSets: 3,
    repGoal: 24, // 3 sets x 8 reps = 24 total
    incrementType: 'weight',
    incrementValue: 5,
    equipmentBrand: 'Hammer Strength',
  };

  const standardRepConfig: ExerciseProgressionConfig = {
    targetSets: 3,
    repGoal: 24,
    incrementType: 'reps',
    incrementValue: 3,
  };

  it('should handle first session with no prior history', () => {
    const result = evaluateProgression(standardWeightConfig, null);
    expect(result.status).toBe('FIRST_SESSION');
    expect(result.suggestedWeight).toBe(0);
    expect(result.suggestedRepGoal).toBe(24);
  });

  it('should trigger WEIGHT increase when rep goal is hit or exceeded', () => {
    const lastSession: LastExercisePerformance = {
      baseWeight: 200,
      sets: [
        { setNumber: 1, reps: 9, weight: 200 },
        { setNumber: 2, reps: 8, weight: 200 },
        { setNumber: 3, reps: 8, weight: 200 },
      ], // Total = 25 reps (exceeds goal of 24)
    };

    const result = evaluateProgression(standardWeightConfig, lastSession);

    expect(result.goalAchieved).toBe(true);
    expect(result.status).toBe('PROGRESSION_WEIGHT_INCREASE');
    expect(result.suggestedWeight).toBe(205); // 200 + 5
    expect(result.totalRepsAchieved).toBe(25);
    expect(result.repDifference).toBe(1);
  });

  it('should trigger REPS increase when increment type is set to reps', () => {
    const lastSession: LastExercisePerformance = {
      baseWeight: 50,
      sets: [
        { setNumber: 1, reps: 8, weight: 50 },
        { setNumber: 2, reps: 8, weight: 50 },
        { setNumber: 3, reps: 8, weight: 50 },
      ], // Total = 24 reps (meets goal of 24)
    };

    const result = evaluateProgression(standardRepConfig, lastSession);

    expect(result.goalAchieved).toBe(true);
    expect(result.status).toBe('PROGRESSION_REPS_INCREASE');
    expect(result.suggestedWeight).toBe(50); // Weight remains the same
    expect(result.suggestedRepGoal).toBe(27); // 24 + 3 reps
  });

  it('should MAINTAIN weight and rep target when rep goal is missed', () => {
    const lastSession: LastExercisePerformance = {
      baseWeight: 200,
      sets: [
        { setNumber: 1, reps: 8, weight: 200 },
        { setNumber: 2, reps: 7, weight: 200 },
        { setNumber: 3, reps: 6, weight: 200 },
      ], // Total = 21 reps (goal is 24)
    };

    const result = evaluateProgression(standardWeightConfig, lastSession);

    expect(result.goalAchieved).toBe(false);
    expect(result.status).toBe('MAINTAIN_TARGET');
    expect(result.suggestedWeight).toBe(200); // No increase
    expect(result.suggestedRepGoal).toBe(24);
    expect(result.repDifference).toBe(-3);
  });

  it('should handle custom decimal increments (e.g. 2.5 kg plates or 7.5 lbs)', () => {
    const decimalConfig: ExerciseProgressionConfig = {
      targetSets: 3,
      repGoal: 45,
      incrementType: 'weight',
      incrementValue: 7.5,
    };

    const lastSession: LastExercisePerformance = {
      baseWeight: 145,
      sets: [
        { setNumber: 1, reps: 15, weight: 145 },
        { setNumber: 2, reps: 15, weight: 145 },
        { setNumber: 3, reps: 15, weight: 145 },
      ], // Total = 45 reps
    };

    const result = evaluateProgression(decimalConfig, lastSession);

    expect(result.goalAchieved).toBe(true);
    expect(result.suggestedWeight).toBe(152.5); // 145 + 7.5
  });
});
