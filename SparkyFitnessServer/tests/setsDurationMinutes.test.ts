import { describe, expect, it } from 'vitest';
import { setsDurationMinutes } from '@workspace/shared';

describe('setsDurationMinutes', () => {
  it('sums per-set duration seconds into minutes', () => {
    expect(setsDurationMinutes([{ duration: 90 }, { duration: 30 }])).toBe(2);
  });

  it('includes rest_time seconds in the total', () => {
    expect(setsDurationMinutes([{ duration: 90, rest_time: 60 }])).toBe(2.5);
  });

  it('returns fallbackMinutes when the sets sum to zero', () => {
    expect(
      setsDurationMinutes([{ duration: 0, rest_time: 0 }], {
        fallbackMinutes: 30,
      })
    ).toBe(30);
  });

  it('returns fallbackMinutes when sets are absent', () => {
    expect(setsDurationMinutes(undefined, { fallbackMinutes: 30 })).toBe(30);
    expect(setsDurationMinutes(null, { fallbackMinutes: 30 })).toBe(30);
    expect(setsDurationMinutes([], { fallbackMinutes: 30 })).toBe(30);
  });

  it('returns 0 without a fallback', () => {
    expect(setsDurationMinutes(undefined)).toBe(0);
    expect(setsDurationMinutes([])).toBe(0);
  });

  it('treats null and undefined set fields as zero', () => {
    expect(
      setsDurationMinutes([{ duration: null, rest_time: 60 }, { duration: 60 }])
    ).toBe(2);
  });

  it('coerces string-numeric values from pg numeric columns', () => {
    expect(
      setsDurationMinutes([
        { duration: '90', rest_time: '30' } as unknown as {
          duration: number;
          rest_time: number;
        },
      ])
    ).toBe(2);
  });

  it('treats non-array input as absent sets', () => {
    expect(
      setsDurationMinutes('nope' as unknown as [], { fallbackMinutes: 30 })
    ).toBe(30);
  });
});
