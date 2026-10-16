import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chatScoreToMoodValue,
  clampStoredMoodValue,
  moodValueToTag,
} from '@workspace/shared';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here,
  '../db/migrations/20261014213414_convert_chatbot_mood_scores.sql'
);

/**
 * Migration 20261014213414 moves the 1-10 scores the chatbot stored raw onto the
 * 10-100 scale. Converting a value that was not a chatbot score would turn a
 * real Sad into a confident mood nobody logged, so which values it touches, and
 * what it writes, is pinned down.
 */
describe('chatbot mood score migration', () => {
  const raw = readFileSync(MIGRATION, 'utf8');
  // Strip `--` comments so assertions test the statement, not the rationale.
  const sql = raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  it('is a single update of mood_entries', () => {
    expect(sql.match(/;/g)).toHaveLength(1);
    expect(sql).toMatch(/^\s*UPDATE\s+public\.mood_entries\s/i);
  });

  it('converts only 1-7 and 9, leaving the ambiguous 8 and 10 alone', () => {
    // 10 sits outside BETWEEN 1 AND 9; 8 is excluded by name.
    expect(sql).toMatch(
      /WHERE\s+mood_value\s+BETWEEN\s+1\s+AND\s+9\s+AND\s+mood_value\s*<>\s*8\s*;/i
    );
  });

  it('writes what the chatbot conversion now writes', () => {
    expect(sql).toMatch(/SET\s+mood_value\s*=\s*mood_value\s*\*\s*10\s/i);
    for (const score of [1, 2, 3, 4, 5, 6, 7, 9]) {
      expect(score * 10).toBe(chatScoreToMoodValue(score));
    }
  });

  it('moves every converted score out of the band all of them read as before', () => {
    // Unconverted, all eight read as Sad. Converted, only "1 out of 10" does.
    for (const score of [1, 2, 3, 4, 5, 6, 7, 9]) {
      expect(moodValueToTag(score)).toBe('sad');
    }
    expect([2, 3, 4, 5, 6, 7, 9].map((s) => moodValueToTag(s * 10))).toEqual([
      'angry',
      'worried',
      'neutral',
      'thoughtful',
      'calm',
      'confident',
      'excited',
    ]);
  });

  it('leaves nothing for a replay to select', () => {
    // What it writes is 10 or more, and the write path now clamps anything
    // below 10 up to it, so no row can come back into 1-9.
    for (const score of [1, 2, 3, 4, 5, 6, 7, 9]) {
      expect(score * 10).toBeGreaterThanOrEqual(10);
    }
    for (const sent of [0, 1, 8, 9.4]) {
      expect(clampStoredMoodValue(sent)).toBeGreaterThanOrEqual(10);
    }
  });
});
