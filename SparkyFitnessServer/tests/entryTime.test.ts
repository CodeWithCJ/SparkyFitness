import { describe, expect, it } from 'vitest';
import {
  isEntryTimeString,
  toHourMinute,
  defaultMealTypeForTime,
  prefillEntryTime,
} from '@workspace/shared';

describe('isEntryTimeString', () => {
  it('identifies valid 24h format strings', () => {
    expect(isEntryTimeString('00:00')).toBe(true);
    expect(isEntryTimeString('12:34')).toBe(true);
    expect(isEntryTimeString('23:59')).toBe(true);
    expect(isEntryTimeString('12:34:56')).toBe(true);
  });

  it('rejects invalid format strings', () => {
    expect(isEntryTimeString('24:00')).toBe(false);
    expect(isEntryTimeString('12:60')).toBe(false);
    expect(isEntryTimeString('9:30')).toBe(false);
    expect(isEntryTimeString('')).toBe(false);
    expect(isEntryTimeString(null)).toBe(false);
    expect(isEntryTimeString(undefined)).toBe(false);
  });
});

describe('toHourMinute', () => {
  it('normalizes seconds and trims properly', () => {
    expect(toHourMinute('12:34:56')).toBe('12:34');
    expect(toHourMinute('08:00:00')).toBe('08:00');
    expect(toHourMinute('23:59')).toBe('23:59');
  });

  it('returns null for invalid inputs', () => {
    expect(toHourMinute('')).toBeNull();
    expect(toHourMinute('invalid')).toBeNull();
    expect(toHourMinute(null)).toBeNull();
  });
});

describe('defaultMealTypeForTime', () => {
  const mealTypes = [
    { name: 'Breakfast', default_time: '08:00' },
    { name: 'Lunch', default_time: '13:00' },
    { name: 'Dinner', default_time: '19:00' },
    { name: 'Snacks' },
  ];

  it('returns correct meal type by matching latest default_time <= now', () => {
    expect(defaultMealTypeForTime(mealTypes, { hour: 9, minute: 30 })).toBe(
      'Breakfast'
    );
    expect(defaultMealTypeForTime(mealTypes, { hour: 13, minute: 0 })).toBe(
      'Lunch'
    );
    expect(defaultMealTypeForTime(mealTypes, { hour: 18, minute: 59 })).toBe(
      'Lunch'
    );
    expect(defaultMealTypeForTime(mealTypes, { hour: 20, minute: 0 })).toBe(
      'Dinner'
    );
  });

  it('falls back to earliest configured meal type when time is before all configured meal times', () => {
    expect(defaultMealTypeForTime(mealTypes, { hour: 7, minute: 0 })).toBe(
      'Breakfast'
    );
  });

  it('correctly handles custom meal time orders like Snacks at 5 PM (17:00) and Dinner at 7 PM (19:00)', () => {
    const customTypes = [
      { name: 'Breakfast', default_time: '08:00' },
      { name: 'Lunch', default_time: '12:00' },
      { name: 'Snacks', default_time: '17:00' },
      { name: 'Dinner', default_time: '19:00' },
    ];

    expect(defaultMealTypeForTime(customTypes, { hour: 14, minute: 30 })).toBe(
      'Lunch'
    );
    expect(defaultMealTypeForTime(customTypes, { hour: 17, minute: 0 })).toBe(
      'Snacks'
    );
    expect(defaultMealTypeForTime(customTypes, { hour: 18, minute: 15 })).toBe(
      'Snacks'
    );
    expect(defaultMealTypeForTime(customTypes, { hour: 19, minute: 0 })).toBe(
      'Dinner'
    );
    expect(defaultMealTypeForTime(customTypes, { hour: 21, minute: 45 })).toBe(
      'Dinner'
    );
  });
});

describe('prefillEntryTime', () => {
  it('uses default time if set and not today', () => {
    expect(
      prefillEntryTime({
        defaultTime: '08:30:00',
        isToday: false,
        tz: 'America/New_York',
      })
    ).toBe('08:30');
    expect(
      prefillEntryTime({
        defaultTime: '12:00',
        isToday: false,
        tz: 'America/New_York',
      })
    ).toBe('12:00');
  });

  it('prefills current time today even if defaultTime is set', () => {
    const timeStr = prefillEntryTime({
      defaultTime: '08:30:00',
      isToday: true,
      tz: 'America/New_York',
    });
    expect(timeStr).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });

  it('returns empty string if not today and no default time is set', () => {
    expect(prefillEntryTime({ isToday: false, tz: 'America/New_York' })).toBe(
      ''
    );
  });

  it('prefills current time if today and no default time is set', () => {
    const timeStr = prefillEntryTime({ isToday: true, tz: 'America/New_York' });
    expect(timeStr).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });
});
