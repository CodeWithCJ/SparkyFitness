import { describe, expect, it } from 'vitest';
import {
  classifyKeyLift,
  summarizeStrengthBalance,
  untrainedHeatLevel,
} from '@workspace/shared';

const lift = (exerciseName: string, estimatedOneRMKg: number) => ({
  exerciseId: null,
  exerciseName,
  estimatedOneRMKg,
  weightKg: estimatedOneRMKg,
  reps: 1,
  achievedAt: '2026-11-01',
});

describe('strength balance', () => {
  it('recognises the bundled names of the key lifts, not their variants', () => {
    expect(classifyKeyLift('Barbell Full Squat')).toBe('squat');
    expect(classifyKeyLift('Squat (Barbell)')).toBe('squat');
    expect(classifyKeyLift('Barbell Bench Press - Medium Grip')).toBe('bench');
    expect(classifyKeyLift('Barbell Deadlift')).toBe('deadlift');
    expect(classifyKeyLift('Standing Military Press')).toBe('overhead_press');
    expect(classifyKeyLift('Bent Over Barbell Row')).toBe('row');
    expect(classifyKeyLift('Front Squat')).toBeNull();
    expect(classifyKeyLift('Romanian Deadlift')).toBeNull();
    expect(classifyKeyLift('Incline Bench Press')).toBeNull();
  });

  it('takes the best of each lift and rates the ratios', () => {
    const result = summarizeStrengthBalance(
      [
        lift('Barbell Squat', 140),
        lift('Squat (Barbell)', 150),
        lift('Bench Press', 100),
        lift('Deadlift', 160),
      ],
      80
    );
    expect(result.keyLifts.map((l) => [l.lift, l.estimatedOneRMKg])).toEqual([
      ['squat', 150],
      ['bench', 100],
      ['deadlift', 160],
    ]);
    expect(result.keyLifts[0]!.bodyweightMultiple).toBeCloseTo(1.875);
    const byKey = Object.fromEntries(result.ratios.map((r) => [r.key, r]));
    expect(byKey.bench_to_squat!.status).toBe('balanced');
    expect(byKey.deadlift_to_squat!.status).toBe('low');
    expect(byKey.press_to_bench).toBeUndefined();
  });

  it('leaves body weight multiples out without a body weight', () => {
    const result = summarizeStrengthBalance([lift('Bench Press', 100)], null);
    expect(result.keyLifts[0]!.bodyweightMultiple).toBeNull();
    expect(result.ratios).toEqual([]);
  });

  it('highlights untrained muscles in the untrained view', () => {
    expect(untrainedHeatLevel(0)).toBe(4);
    expect(untrainedHeatLevel(3)).toBe(0);
  });
});
