import { describe, expect, it } from 'vitest';
import { normalizeExerciseImages } from '../utils/exerciseImages.js';

describe('normalizeExerciseImages', () => {
  it('passes a normal array through untouched', () => {
    expect(
      normalizeExerciseImages(['Ab_Crunch_Machine/0.jpg', 'A/1.jpg'])
    ).toEqual(['Ab_Crunch_Machine/0.jpg', 'A/1.jpg']);
  });

  it('unwraps a legacy double-encoded array', () => {
    // The shape that leaves `Ab Roller` requesting `/uploads/exercises/["...]`.
    expect(
      normalizeExerciseImages(['["Ab_Roller/0.jpg","Ab_Roller/1.jpg"]'])
    ).toEqual(['Ab_Roller/0.jpg', 'Ab_Roller/1.jpg']);
  });

  it('parses the raw JSON text the column stores', () => {
    expect(normalizeExerciseImages('["A/0.jpg","A/1.jpg"]')).toEqual([
      'A/0.jpg',
      'A/1.jpg',
    ]);
  });

  it('drops the "[]" sentinel and empty entries', () => {
    expect(normalizeExerciseImages(['[]'])).toEqual([]);
    expect(normalizeExerciseImages('[]')).toEqual([]);
    expect(normalizeExerciseImages(['', '  ', 'A/0.jpg'])).toEqual(['A/0.jpg']);
  });

  it('keeps a plain path that merely contains punctuation', () => {
    expect(normalizeExerciseImages(['My_Exercise [v2]/0.jpg'])).toEqual([
      'My_Exercise [v2]/0.jpg',
    ]);
  });

  it('preserves absolute URLs', () => {
    expect(normalizeExerciseImages(['https://example.com/a.png'])).toEqual([
      'https://example.com/a.png',
    ]);
  });

  it('returns an empty array for null/undefined/non-string entries', () => {
    expect(normalizeExerciseImages(null)).toEqual([]);
    expect(normalizeExerciseImages(undefined)).toEqual([]);
    expect(normalizeExerciseImages([null, 42, {}])).toEqual([]);
  });
});
