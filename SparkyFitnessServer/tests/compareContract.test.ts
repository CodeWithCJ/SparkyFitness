import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  compareQuerySchema,
  compareSinceQuerySchema,
  compareSinceResponseSchema,
  compareSinceResultSchema,
  type CompareSinceResult,
} from '@workspace/shared';
import type { z } from 'zod';

describe('since query', () => {
  it('accepts since without start, end or timing', () => {
    const q = compareSinceQuerySchema.parse({
      a: 'meditated',
      b: 'timeAsleep',
      mode: 'since',
    });
    expect(q.habitStart).toBeUndefined();
    expect(q.line).toBeUndefined();
  });
  it('rejects a == b', () => {
    const r = compareSinceQuerySchema.safeParse({
      a: 'mood',
      b: 'mood',
      mode: 'since',
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(['b']);
    expect(r.error?.issues[0].message).toBe(
      'Pick two different things to compare'
    );
  });
  it('rejects a malformed habitStart', () => {
    expect(
      compareSinceQuerySchema.safeParse({
        a: 'meditated',
        b: 'mood',
        mode: 'since',
        habitStart: '2026-13-45',
      }).success
    ).toBe(false);
  });
  it('coerces line and keeps habitStart', () => {
    const q = compareSinceQuerySchema.parse({
      a: 'meditated',
      b: 'mood',
      mode: 'since',
      habitStart: '2026-03-01',
      line: '70.5',
    });
    expect(q.line).toBe(70.5);
    expect(q.habitStart).toBe('2026-03-01');
  });
  it('leaves the day/week schema rejecting since', () => {
    expect(
      compareQuerySchema.safeParse({
        a: 'meditated',
        b: 'mood',
        mode: 'since',
        start: '2026-01-01',
        end: '2026-02-01',
      }).success
    ).toBe(false);
  });
});

describe('since response', () => {
  const stretch = {
    from: '2026-01-01',
    to: '2026-01-31',
    days: 31,
    valueDays: 20,
  };
  it('mirrors CompareSinceResult', () => {
    expectTypeOf<
      z.infer<typeof compareSinceResultSchema>
    >().toEqualTypeOf<CompareSinceResult>();
  });
  const base = {
    mode: 'since' as const,
    habit: { key: 'meditated' as const, values: { '2026-01-01': 1 } },
    outcome: { key: 'mood' as const, values: { '2026-01-01': 70 } },
  };
  it('parses an ok result', () => {
    const result: CompareSinceResult = {
      status: 'ok',
      start: '2026-02-01',
      suggestedStart: '2026-02-01',
      before: { ...stretch, mean: 60, p10: 50, p90: 70, shareAtOrAbove: 0.4 },
      since: { ...stretch, mean: 66, p10: 55, p90: 75, shareAtOrAbove: 0.6 },
      line: 70,
      diff: 6,
      low: 1,
      high: 11,
      p: 0.01,
      changed: true,
      regularity: { weeksKept: 3, weeks: 4 },
      alreadyChanging: false,
    };
    expect(
      compareSinceResponseSchema.parse({ ...base, result }).result
    ).toEqual(result);
  });
  it('parses a noStart result', () => {
    const result: CompareSinceResult = {
      status: 'not_enough',
      reason: 'noStart',
      start: null,
      suggestedStart: null,
      line: 70,
    };
    expect(
      compareSinceResponseSchema.parse({ ...base, result }).result
    ).toEqual(result);
  });
});
