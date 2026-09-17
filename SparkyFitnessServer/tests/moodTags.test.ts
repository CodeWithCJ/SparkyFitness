import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_MOODS,
  moodValueToTag,
  representativeMoodValue,
  moodByName,
  chatScoreToMoodValue,
  moodValueToChatScore,
  clampStoredMoodValue,
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

describe('the chatbot 1-10 scale', () => {
  it('spreads the ten scores across the bands instead of bunching them in sad', () => {
    // Stored verbatim, all ten landed in `sad`, whose band runs to 15.
    const bands = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) =>
      moodValueToTag(chatScoreToMoodValue(score))
    );

    expect(bands).toEqual([
      'sad',
      'angry',
      'worried',
      'neutral',
      'thoughtful',
      'calm',
      'confident',
      'happy',
      'excited',
      'excited',
    ]);
  });

  it('round-trips every score it can be given', () => {
    for (let score = 1; score <= 10; score += 1) {
      expect(moodValueToChatScore(chatScoreToMoodValue(score))).toBe(score);
    }
  });

  it('reads back a value written by any other client', () => {
    // Garmin writes 15/25/.../95; the check-in picker writes 10/20/.../95.
    expect(moodValueToChatScore(10)).toBe(1);
    expect(moodValueToChatScore(15)).toBe(2);
    expect(moodValueToChatScore(50)).toBe(5);
    expect(moodValueToChatScore(95)).toBe(10);
    expect(moodValueToChatScore(100)).toBe(10);
  });

  it('keeps a score inside 1-10 whatever it is handed', () => {
    expect(chatScoreToMoodValue(0)).toBe(10);
    expect(chatScoreToMoodValue(11)).toBe(100);
    expect(moodValueToChatScore(0)).toBe(1);
    expect(moodValueToChatScore(1000)).toBe(10);
  });
});

describe('clampStoredMoodValue', () => {
  it('leaves a value the column can already hold', () => {
    expect(clampStoredMoodValue(10)).toBe(10);
    expect(clampStoredMoodValue(70)).toBe(70);
    expect(clampStoredMoodValue(100)).toBe(100);
  });

  it('keeps an out-of-range value in the band it meant', () => {
    // 8 is what the check-in picker wrote for Sad before #2495, and 10 is Sad
    // too, so the day survives the clamp with its mood intact.
    expect(moodValueToTag(clampStoredMoodValue(8)!)).toBe('sad');
    expect(clampStoredMoodValue(8)).toBe(10);
    expect(clampStoredMoodValue(140)).toBe(100);
  });

  it('rounds to what an integer column can hold', () => {
    expect(clampStoredMoodValue(62.4)).toBe(62);
    expect(clampStoredMoodValue('70')).toBe(70);
  });

  it('reports anything that is not a number rather than guessing', () => {
    expect(clampStoredMoodValue('great')).toBeNull();
    expect(clampStoredMoodValue(Infinity)).toBeNull();
    // Each of these is 0 to `Number()`, which would clamp to a real mood.
    expect(clampStoredMoodValue(null)).toBeNull();
    expect(clampStoredMoodValue(undefined)).toBeNull();
    expect(clampStoredMoodValue('')).toBeNull();
    expect(clampStoredMoodValue(false)).toBeNull();
    expect(clampStoredMoodValue([])).toBeNull();
  });
});

describe('BUILT_IN_MOODS', () => {
  it('has nine banded moods covering the scale up to 100', () => {
    const banded = BUILT_IN_MOODS.filter(
      (m) => m.band !== null && m.band !== undefined
    );
    expect(banded).toHaveLength(9);
    expect(banded[banded.length - 1]!.band).toBe(100);
  });
});
