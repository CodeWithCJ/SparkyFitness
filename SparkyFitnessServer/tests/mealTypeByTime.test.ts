import { describe, it, expect } from 'vitest';
import {
  parseClockMinutes,
  resolveMealTypeIdForTime,
} from '../utils/mealTypeByTime.js';

// #2115: a container linked to a food used to fall back to getAllMealTypes()[0]
// when no meal type was pinned, so every drink all day landed in the first meal
// type (almost always Breakfast). The same coffee is breakfast at 08:00 and
// dinner at 20:00, which matters as soon as a drink is taken more than once.

const MEALS = [
  { id: 'breakfast', default_time: '08:00:00' },
  { id: 'lunch', default_time: '12:30:00' },
  { id: 'snacks', default_time: '15:00:00' },
  { id: 'dinner', default_time: '19:00:00' },
];

describe('parseClockMinutes', () => {
  it('reads HH:MM and HH:MM:SS', () => {
    expect(parseClockMinutes('08:00')).toBe(480);
    expect(parseClockMinutes('12:30:00')).toBe(750);
  });

  it('returns null for anything it cannot place on a clock', () => {
    expect(parseClockMinutes(null)).toBeNull();
    expect(parseClockMinutes('')).toBeNull();
    expect(parseClockMinutes('not-a-time')).toBeNull();
    expect(parseClockMinutes('25:00')).toBeNull();
    expect(parseClockMinutes('08:99')).toBeNull();
  });
});

describe('resolveMealTypeIdForTime', () => {
  it('places a drink in the meal whose default time is nearest', () => {
    expect(resolveMealTypeIdForTime(MEALS, '08:10')).toBe('breakfast');
    expect(resolveMealTypeIdForTime(MEALS, '13:00')).toBe('lunch');
    expect(resolveMealTypeIdForTime(MEALS, '20:00')).toBe('dinner');
  });

  it('sends the same drink to a different meal later in the day', () => {
    // The whole point: one container, three taps, three buckets.
    expect(resolveMealTypeIdForTime(MEALS, '07:55')).toBe('breakfast');
    expect(resolveMealTypeIdForTime(MEALS, '12:20')).toBe('lunch');
    expect(resolveMealTypeIdForTime(MEALS, '19:30')).toBe('dinner');
  });

  it('crosses to the next meal once it is closer, not once it has started', () => {
    // 11:00 is 3h after breakfast but only 1h30 before lunch.
    expect(resolveMealTypeIdForTime(MEALS, '11:00')).toBe('lunch');
  });

  it('clamps to the nearest meal outside the day, without wrapping', () => {
    expect(resolveMealTypeIdForTime(MEALS, '03:00')).toBe('breakfast');
    expect(resolveMealTypeIdForTime(MEALS, '23:59')).toBe('dinner');
  });

  it('skips meal types with no default time', () => {
    const withGaps = [
      { id: 'custom', default_time: null },
      { id: 'lunch', default_time: '12:30' },
    ];
    expect(resolveMealTypeIdForTime(withGaps, '12:00')).toBe('lunch');
  });

  it('falls back to the first entry when nothing can be placed on the clock', () => {
    const untimed = [{ id: 'a', default_time: null }, { id: 'b' }];
    expect(resolveMealTypeIdForTime(untimed, '12:00')).toBe('a');
  });

  it('returns null for a user with no meal types at all', () => {
    expect(resolveMealTypeIdForTime([], '12:00')).toBeNull();
  });

  it('keeps the earlier meal on an exact tie, so row order cannot decide it', () => {
    const tied = [
      { id: 'earlier', default_time: '11:00' },
      { id: 'later', default_time: '13:00' },
    ];
    expect(resolveMealTypeIdForTime(tied, '12:00')).toBe('earlier');
  });
});
