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

// meal_types.default_time ships NULL for the built-in meals, so without the
// shared-anchor fallback this resolver would be inert on a default install --
// every drink would land in whichever meal type came back first.
describe('resolveMealTypeIdForTime — built-in meals with no default_time', () => {
  const UNTIMED = [
    { id: 'breakfast', name: 'breakfast', default_time: null },
    { id: 'lunch', name: 'lunch', default_time: null },
    { id: 'snacks', name: 'snacks', default_time: null },
    { id: 'dinner', name: 'dinner', default_time: null },
  ];

  it('falls back to the shared anchor for the meal name', () => {
    expect(resolveMealTypeIdForTime(UNTIMED, '08:10')).toBe('breakfast');
    expect(resolveMealTypeIdForTime(UNTIMED, '12:40')).toBe('lunch');
    expect(resolveMealTypeIdForTime(UNTIMED, '15:10')).toBe('snacks');
    expect(resolveMealTypeIdForTime(UNTIMED, '19:30')).toBe('dinner');
  });

  it('is case-insensitive about the meal name', () => {
    const titled = [
      { id: 'b', name: 'Breakfast', default_time: null },
      { id: 'd', name: 'Dinner', default_time: null },
    ];
    expect(resolveMealTypeIdForTime(titled, '08:00')).toBe('b');
    expect(resolveMealTypeIdForTime(titled, '19:00')).toBe('d');
  });

  it("prefers a meal type's own default_time over the shared anchor", () => {
    const overridden = [
      { id: 'breakfast', name: 'breakfast', default_time: '05:00' },
      { id: 'lunch', name: 'lunch', default_time: null },
    ];
    // 06:00 is nearer the overridden 05:00 than the 12:30 lunch anchor.
    expect(resolveMealTypeIdForTime(overridden, '06:00')).toBe('breakfast');
  });

  it('skips a custom meal type that has neither a time nor a known name', () => {
    const mixed = [
      { id: 'custom', name: 'Pre-workout', default_time: null },
      { id: 'dinner', name: 'dinner', default_time: null },
    ];
    expect(resolveMealTypeIdForTime(mixed, '19:00')).toBe('dinner');
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
