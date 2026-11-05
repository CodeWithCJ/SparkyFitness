import { describe, it, expect } from 'vitest';
import {
  distributeProgressionReps,
  evaluateProgression,
  type ExerciseProgressionConfig,
  type LastExercisePerformance,
} from '@workspace/shared';

const session = (weight: number, reps: number[]): LastExercisePerformance => ({
  baseWeight: weight,
  sets: reps.map((r, i) => ({ setNumber: i + 1, reps: r, weight })),
});

const double: ExerciseProgressionConfig = {
  progressionMode: 'double',
  targetSets: 3,
  repGoal: 12,
  repRangeMin: 8,
  incrementType: 'weight',
  incrementValue: 2.5,
};

describe('double progression', () => {
  it('holds load and aims for the top while any set is short of it', () => {
    const r = evaluateProgression(double, session(60, [12, 11, 10]));
    expect(r.status).toBe('MAINTAIN_TARGET');
    expect(r.suggestedWeight).toBe(60);
    expect(r.suggestedRepGoal).toBe(12);
    expect(r.reason).toMatchObject({
      code: 'range_climbing',
      setsAtTop: 1,
      sets: 3,
      repMin: 8,
      repMax: 12,
    });
    expect(distributeProgressionReps(r, 'double', 3)).toBeNull();
  });

  it('adds load and drops reps to the bottom once every set hits the top', () => {
    const r = evaluateProgression(double, session(60, [12, 12, 12]));
    expect(r.status).toBe('PROGRESSION_WEIGHT_INCREASE');
    expect(r.suggestedWeight).toBe(62.5);
    expect(r.suggestedRepGoal).toBe(8);
    expect(r.reason?.code).toBe('range_top_reached');
    expect(distributeProgressionReps(r, 'double', 3)).toEqual([8, 8, 8]);
  });

  it('needs the planned number of sets before moving on', () => {
    const r = evaluateProgression(double, session(60, [12, 12]));
    expect(r.status).toBe('MAINTAIN_TARGET');
  });

  it('aims for the top of the range on a first session', () => {
    const r = evaluateProgression(double, null);
    expect(r.status).toBe('FIRST_SESSION');
    expect(r.suggestedRepGoal).toBe(12);
  });
});

describe('triple progression', () => {
  const triple: ExerciseProgressionConfig = {
    ...double,
    progressionMode: 'triple',
  };

  it('adds a set before adding load', () => {
    const r = evaluateProgression(triple, session(60, [12, 12, 12]));
    expect(r.status).toBe('PROGRESSION_SET_INCREASE');
    expect(r.suggestedWeight).toBe(60);
    expect(r.suggestedSets).toBe(4);
    expect(r.suggestedRepGoal).toBe(8);
    expect(distributeProgressionReps(r, 'triple', 3)).toEqual([8, 8, 8, 8]);
  });

  it('adds load and returns to the planned sets after two extra sets', () => {
    const r = evaluateProgression(triple, session(60, [12, 12, 12, 12, 12]));
    expect(r.status).toBe('PROGRESSION_WEIGHT_INCREASE');
    expect(r.suggestedWeight).toBe(62.5);
    expect(r.suggestedSets).toBe(3);
  });
});

describe('stall deload', () => {
  const fixed: ExerciseProgressionConfig = {
    progressionMode: 'fixed',
    targetSets: 3,
    repGoal: 5,
    incrementType: 'weight',
    incrementValue: 2.5,
  };

  it('deloads about 10% after three misses at the same load', () => {
    const r = evaluateProgression(fixed, session(100, [5, 5, 4]), [
      session(100, [5, 4, 4]),
      session(100, [5, 5, 3]),
    ]);
    expect(r.status).toBe('DELOAD');
    expect(r.suggestedWeight).toBe(90);
    expect(r.goalAchieved).toBe(false);
    expect(r.reason).toEqual({
      code: 'stall_deload',
      stalledSessions: 3,
      deloadPercent: 10,
    });
  });

  it('rounds the deload down to whole increments', () => {
    const r = evaluateProgression(fixed, session(62.5, [4, 4, 4]), [
      session(62.5, [4, 4, 4]),
      session(62.5, [4, 4, 4]),
    ]);
    expect(r.suggestedWeight).toBe(55);
  });

  it('does not deload when an earlier miss was at another load', () => {
    const r = evaluateProgression(fixed, session(100, [4, 4, 4]), [
      session(100, [4, 4, 4]),
      session(97.5, [4, 4, 4]),
    ]);
    expect(r.status).toBe('MAINTAIN_TARGET');
  });

  it('does not deload when an earlier session hit the goal', () => {
    const r = evaluateProgression(fixed, session(100, [4, 4, 4]), [
      session(100, [4, 4, 4]),
      session(100, [5, 5, 5]),
    ]);
    expect(r.status).toBe('MAINTAIN_TARGET');
  });

  it('does not deload without enough history', () => {
    const r = evaluateProgression(fixed, session(100, [4, 4, 4]), [
      session(100, [4, 4, 4]),
    ]);
    expect(r.status).toBe('MAINTAIN_TARGET');
  });

  it('never deloads rep-only progression', () => {
    const reps: ExerciseProgressionConfig = {
      ...fixed,
      incrementType: 'reps',
      incrementValue: 1,
    };
    const r = evaluateProgression(reps, session(100, [4, 4, 4]), [
      session(100, [4, 4, 4]),
      session(100, [4, 4, 4]),
    ]);
    expect(r.status).toBe('MAINTAIN_TARGET');
  });

  it('deloads double progression that stops climbing', () => {
    const r = evaluateProgression(double, session(60, [9, 8, 8]), [
      session(60, [9, 8, 8]),
      session(60, [10, 8, 7]),
    ]);
    expect(r.status).toBe('DELOAD');
    expect(r.suggestedWeight).toBe(52.5);
  });
});
