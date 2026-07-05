import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_MOODS,
  moodValueToTag,
  representativeMoodValue,
  moodByName,
} from '@workspace/shared';

describe('moodValueToTag', () => {
  it('maps 0-100 bands to the expected tags', () => {
    expect(moodValueToTag(5)).toBe('sad');
    expect(moodValueToTag(20)).toBe('angry');
    expect(moodValueToTag(30)).toBe('worried');
    expect(moodValueToTag(40)).toBe('neutral');
    expect(moodValueToTag(50)).toBe('thoughtful');
    expect(moodValueToTag(60)).toBe('calm');
    expect(moodValueToTag(70)).toBe('confident');
    expect(moodValueToTag(80)).toBe('happy');
    expect(moodValueToTag(95)).toBe('excited');
  });
});

describe('representativeMoodValue', () => {
  it('returns a band midpoint for a banded tag', () => {
    // 'happy' band is (75, 85] -> midpoint 80
    expect(representativeMoodValue(['happy'])).toBe(80);
    // 'sad' band is (0, 15] -> midpoint ~8
    expect(representativeMoodValue(['sad'])).toBeLessThanOrEqual(15);
  });
  it('falls back for descriptive-only tags', () => {
    expect(representativeMoodValue(['tired'])).toBe(50);
    expect(representativeMoodValue([], 42)).toBe(42);
  });
  it('round-trips value -> tag -> value within the same band', () => {
    for (const v of [10, 30, 60, 90]) {
      const tag = moodValueToTag(v);
      const back = representativeMoodValue([tag]);
      const def = moodByName(tag)!;
      expect(back).toBeLessThanOrEqual(def.band!);
    }
  });
});

describe('BUILT_IN_MOODS', () => {
  it('has nine banded moods covering the scale up to 100', () => {
    const banded = BUILT_IN_MOODS.filter((m) => m.band != null);
    expect(banded).toHaveLength(9);
    expect(banded[banded.length - 1]!.band).toBe(100);
  });
});
