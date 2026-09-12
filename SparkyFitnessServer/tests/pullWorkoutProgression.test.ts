import { describe, it, expect } from 'vitest';
import {
  evaluateProgression,
  ExerciseProgressionConfig,
  LastExercisePerformance,
} from '@workspace/shared';

describe('Real-World Pull Workout - Progression Verification', () => {
  it('Cable Rear Delt Fly: Smashed 78 reps at 7.5 lbs -> Bumps weight to 10.0 lbs', () => {
    const rearDeltConfig: ExerciseProgressionConfig = {
      progressionMode: 'rep_goal',
      targetSets: 5,
      repGoal: 75, // 5 sets x 15 reps goal
      incrementType: 'weight',
      incrementValue: 2.5, // Next pin jump on cable stack
      equipmentBrand: 'Cable Stack',
    };

    const yesterdayPerformance: LastExercisePerformance = {
      baseWeight: 7.5,
      sets: [
        { setNumber: 1, reps: 18, weight: 7.5 },
        { setNumber: 2, reps: 15, weight: 7.5 },
        { setNumber: 3, reps: 15, weight: 7.5 },
        { setNumber: 4, reps: 15, weight: 7.5 },
        { setNumber: 5, reps: 15, weight: 7.5 },
      ], // Total = 78 reps
    };

    const result = evaluateProgression(rearDeltConfig, yesterdayPerformance);

    expect(result.goalAchieved).toBe(true);
    expect(result.status).toBe('PROGRESSION_WEIGHT_INCREASE');
    expect(result.suggestedWeight).toBe(10.0); // 7.5 + 2.5 lbs
    expect(result.totalRepsAchieved).toBe(78);
    expect(result.repDifference).toBe(3); // +3 reps over goal
  });

  it('Pull-ups: Logged 42 reps at bodyweight -> Increments target to 45 reps (Step-Load)', () => {
    const pullupConfig: ExerciseProgressionConfig = {
      progressionMode: 'step_load',
      targetSets: 10,
      repGoal: 40,
      incrementType: 'reps',
      incrementValue: 3,
      equipmentBrand: 'Rack',
    };

    const yesterdayPerformance: LastExercisePerformance = {
      baseWeight: 0,
      sets: [
        { setNumber: 1, reps: 5, weight: 0 },
        { setNumber: 2, reps: 5, weight: 0 },
        { setNumber: 3, reps: 5, weight: 0 },
        { setNumber: 4, reps: 5, weight: 0 },
        { setNumber: 5, reps: 4, weight: 0 },
        { setNumber: 6, reps: 4, weight: 0 },
        { setNumber: 7, reps: 4, weight: 0 },
        { setNumber: 8, reps: 4, weight: 0 },
        { setNumber: 9, reps: 3, weight: 0 },
        { setNumber: 10, reps: 3, weight: 0 },
      ], // Total = 42 reps
    };

    const result = evaluateProgression(pullupConfig, yesterdayPerformance);

    expect(result.goalAchieved).toBe(true);
    expect(result.status).toBe('PROGRESSION_REPS_INCREASE');
    expect(result.suggestedWeight).toBe(0); // Bodyweight stays 0
    expect(result.suggestedRepGoal).toBe(43); // 40 + 3
    expect(result.totalRepsAchieved).toBe(42);
  });

  it('Goblet Squat: Hit 20 reps on all 5 sets -> Overload weight to 15 lbs (Fixed Mode)', () => {
    const squatConfig: ExerciseProgressionConfig = {
      progressionMode: 'fixed',
      targetSets: 5,
      repGoal: 20, // Must hit 20 on all sets
      incrementType: 'weight',
      incrementValue: 5,
      equipmentBrand: 'Dumbbell',
    };

    const yesterdayPerformance: LastExercisePerformance = {
      baseWeight: 10,
      sets: [
        { setNumber: 1, reps: 20, weight: 10 },
        { setNumber: 2, reps: 20, weight: 10 },
        { setNumber: 3, reps: 20, weight: 10 },
        { setNumber: 4, reps: 20, weight: 10 },
        { setNumber: 5, reps: 20, weight: 10 },
      ], // Total = 100 reps
    };

    const result = evaluateProgression(squatConfig, yesterdayPerformance);

    expect(result.goalAchieved).toBe(true);
    expect(result.status).toBe('PROGRESSION_WEIGHT_INCREASE');
    expect(result.suggestedWeight).toBe(15); // 10 + 5 lbs
  });

  it('EZ-Bar Skullcrusher: Hit 69 reps (short of 75 target) -> Holds 37.5 lbs with +6 rep deficit prompt', () => {
    const skullcrusherConfig: ExerciseProgressionConfig = {
      progressionMode: 'rep_goal',
      targetSets: 5,
      repGoal: 75,
      incrementType: 'weight',
      incrementValue: 2.5,
      equipmentBrand: 'EZ Bar',
    };

    const yesterdayPerformance: LastExercisePerformance = {
      baseWeight: 37.5,
      sets: [
        { setNumber: 1, reps: 18, weight: 37.5 },
        { setNumber: 2, reps: 15, weight: 37.5 },
        { setNumber: 3, reps: 15, weight: 37.5 },
        { setNumber: 4, reps: 10, weight: 37.5 },
        { setNumber: 5, reps: 11, weight: 37.5 },
      ], // Total = 69 reps
    };

    const result = evaluateProgression(
      skullcrusherConfig,
      yesterdayPerformance
    );

    expect(result.goalAchieved).toBe(false);
    expect(result.status).toBe('MAINTAIN_TARGET');
    expect(result.suggestedWeight).toBe(37.5); // No increase
    expect(result.suggestedRepGoal).toBe(75);
    expect(result.repDifference).toBe(-6); // 6 reps under goal
  });
});
