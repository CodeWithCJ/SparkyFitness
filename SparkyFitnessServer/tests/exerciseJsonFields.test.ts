import { vi, describe, expect, it } from 'vitest';

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import {
  parseJsonArrayField,
  normalizeToStringArray,
} from '../utils/exerciseJsonFields.js';
import { log } from '../config/logging.js';

describe('parseJsonArrayField', () => {
  it('returns [] for null, undefined, and empty string', () => {
    expect(parseJsonArrayField(null)).toEqual([]);
    expect(parseJsonArrayField(undefined)).toEqual([]);
    expect(parseJsonArrayField('')).toEqual([]);
  });

  it('parses a proper JSON array as-is', () => {
    expect(parseJsonArrayField('["Barbell","Dumbbell"]')).toEqual([
      'Barbell',
      'Dumbbell',
    ]);
  });

  it('wraps a bare JSON-encoded string into a single-item array', () => {
    // The exact shape that crashed the CSV export: a legacy row stored a
    // single equipment value as a JSON string instead of a one-item array,
    // so JSON.parse succeeded but returned a string, and .join() downstream
    // threw "equipment.join is not a function".
    expect(parseJsonArrayField('"Barbell"')).toEqual(['Barbell']);
  });

  it('wraps a bare JSON number or object the same way', () => {
    expect(parseJsonArrayField('5')).toEqual([5]);
    expect(parseJsonArrayField('{"a":1}')).toEqual([{ a: 1 }]);
  });

  it('returns [] and logs with the given context for invalid JSON', () => {
    expect(
      parseJsonArrayField('Barbell', 'equipment for exercise ex-1')
    ).toEqual([]);
    expect(parseJsonArrayField('[Barbell, Dumbbell]')).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('(equipment for exercise ex-1)'),
      expect.any(Error)
    );
  });
});

describe('normalizeToStringArray', () => {
  it('returns an already-correct array unchanged', () => {
    expect(normalizeToStringArray(['Barbell', 'Dumbbell'])).toEqual([
      'Barbell',
      'Dumbbell',
    ]);
  });

  it('wraps a single string into a one-item array', () => {
    // The exact shape free-exercise-db's raw JSON sends for a solo value.
    expect(normalizeToStringArray('Barbell')).toEqual(['Barbell']);
  });

  it('returns [] for null and undefined', () => {
    expect(normalizeToStringArray(null)).toEqual([]);
    expect(normalizeToStringArray(undefined)).toEqual([]);
  });

  it('returns [] for an empty string rather than a one-item array of ""', () => {
    expect(normalizeToStringArray('')).toEqual([]);
  });

  it('returns [] for an empty array unchanged', () => {
    expect(normalizeToStringArray([])).toEqual([]);
  });

  it('drops non-string elements instead of persisting them as valid-but-wrong-shape JSON', () => {
    // Callers into this (CSV import, external-provider responses) are
    // untyped at runtime despite the unknown-accepting signature; a stray
    // number or object must not silently ride through to JSON.stringify.
    expect(normalizeToStringArray(['Barbell', 5, null, { a: 1 }])).toEqual([
      'Barbell',
    ]);
  });

  it('returns [] for a non-string, non-array value rather than wrapping it', () => {
    expect(normalizeToStringArray(5)).toEqual([]);
  });
});
