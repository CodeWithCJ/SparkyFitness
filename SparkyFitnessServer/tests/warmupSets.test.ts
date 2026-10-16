import { describe, expect, it } from 'vitest';
import {
  calculateWarmupSets,
  DEFAULT_WARMUP_METHOD,
  findWarmupBaseIndex,
  normalizeWarmupMethod,
  usesDumbbells,
} from '@workspace/shared';

describe('calculateWarmupSets', () => {
  it('follows the default 40% x 5, 60% x 5, 80% x 3 in kilograms', () => {
    // 100 kg, rounded to 2.5: 40, 60, 80
    expect(calculateWarmupSets(100, 'kg')).toEqual([
      { weightKg: 40, reps: 5 },
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 3 },
    ]);
  });

  it('rounds each step to the increment', () => {
    // 82.5 kg: 33 -> 32.5, 49.5 -> 50, 66 -> 65
    expect(calculateWarmupSets(82.5, 'kg').map((s) => s.weightKg)).toEqual([
      32.5, 50, 65,
    ]);
    // A 1.25 kg step: 33 -> 32.5, 49.5 -> 50, 66 -> 66.25
    expect(
      calculateWarmupSets(82.5, 'kg', { increment: 1.25 }).map(
        (s) => s.weightKg
      )
    ).toEqual([32.5, 50, 66.25]);
  });

  it('works in pounds and returns kilograms', () => {
    // 225 lb at a 5 lb step: 90, 135, 180
    const sets = calculateWarmupSets(225 * 0.45359237, 'lbs');
    expect(sets.map((s) => s.reps)).toEqual([5, 5, 3]);
    expect(sets.map((s) => Math.round(s.weightKg / 0.45359237))).toEqual([
      90, 135, 180,
    ]);
  });

  it('follows a custom method and a custom increment', () => {
    // 100 kg at 2 kg dumbbell steps: 50 -> 50, 70 -> 70, 90 -> 90
    expect(
      calculateWarmupSets(100, 'kg', {
        method: [
          { percent: 50, reps: 8 },
          { percent: 75, reps: 4 },
        ],
        increment: 2,
      })
    ).toEqual([
      { weightKg: 50, reps: 8 },
      { weightKg: 76, reps: 4 },
    ]);
  });

  it('drops steps that would not climb, so a light weight gets a shorter ramp', () => {
    // 10 kg: 4 -> 5, 6 -> 5 (not above), 8 -> 7.5 -> rounds to 7.5
    expect(calculateWarmupSets(10, 'kg').map((s) => s.weightKg)).toEqual([
      5, 7.5,
    ]);
  });

  it('never leaves a step at or above the working weight', () => {
    for (const w of [3, 5, 7.5, 22.5, 27.5, 40, 62.5, 140, 200]) {
      const sets = calculateWarmupSets(w, 'kg');
      expect(sets.every((s) => s.weightKg < w && s.weightKg > 0)).toBe(true);
      const weights = sets.map((s) => s.weightKg);
      expect([...weights].sort((a, b) => a - b)).toEqual(weights);
    }
  });

  it('gives nothing for a missing or invalid weight', () => {
    expect(calculateWarmupSets(0, 'kg')).toEqual([]);
    expect(calculateWarmupSets(-5, 'kg')).toEqual([]);
    expect(calculateWarmupSets(Number.NaN, 'kg')).toEqual([]);
  });
});

describe('normalizeWarmupMethod', () => {
  it('keeps a valid method, sorted by percent', () => {
    expect(
      normalizeWarmupMethod([
        { percent: 80, reps: 3 },
        { percent: 50, reps: 5 },
      ])
    ).toEqual([
      { percent: 50, reps: 5 },
      { percent: 80, reps: 3 },
    ]);
  });

  it('clamps and rounds, and skips unusable steps', () => {
    expect(
      normalizeWarmupMethod([
        { percent: 150, reps: 100 },
        { percent: 0, reps: 5 },
        { percent: 40.4, reps: 0 },
        null,
        { percent: 'x', reps: 5 },
        { percent: 60.4, reps: 4.6 },
      ])
    ).toEqual([
      { percent: 60, reps: 5 },
      { percent: 95, reps: 30 },
    ]);
  });

  it('falls back to the default when nothing is usable', () => {
    expect(normalizeWarmupMethod(undefined)).toEqual(DEFAULT_WARMUP_METHOD);
    expect(normalizeWarmupMethod([])).toEqual(DEFAULT_WARMUP_METHOD);
    expect(normalizeWarmupMethod([{ percent: 0, reps: 0 }])).toEqual(
      DEFAULT_WARMUP_METHOD
    );
  });

  it('keeps at most the step limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      percent: 10 + i * 5,
      reps: 5,
    }));
    expect(normalizeWarmupMethod(many)).toHaveLength(8);
  });
});

describe('usesDumbbells', () => {
  it('reads the equipment list', () => {
    expect(usesDumbbells(['Dumbbell'])).toBe(true);
    expect(usesDumbbells(['barbell', 'dumbbells'])).toBe(true);
    expect(usesDumbbells(['Barbell'])).toBe(false);
    expect(usesDumbbells('dumbbell')).toBe(true);
    expect(usesDumbbells(null)).toBe(false);
    expect(usesDumbbells([])).toBe(false);
  });
});

describe('findWarmupBaseIndex', () => {
  it('is the first working set, skipping warm-up and drop sets', () => {
    expect(
      findWarmupBaseIndex([
        { set_type: 'warmup', weight: 20 },
        { set_type: 'drop', weight: 60 },
        { set_type: 'normal', weight: 100 },
        { set_type: 'normal', weight: 105 },
      ])
    ).toBe(2);
  });

  it('uses a supplied placeholder weight for an untouched set', () => {
    expect(
      findWarmupBaseIndex([{ set_type: 'normal', weight: null }], () => 80)
    ).toBe(0);
  });

  it('is -1 when the first working set has no weight', () => {
    expect(findWarmupBaseIndex([{ set_type: 'normal', weight: null }])).toBe(
      -1
    );
    expect(findWarmupBaseIndex([{ set_type: 'warmup', weight: 20 }])).toBe(-1);
    expect(findWarmupBaseIndex([])).toBe(-1);
  });
});
