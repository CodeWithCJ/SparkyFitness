import {
  dayFromNow,
  normalizeCheckinTimes,
  roundToQuarterHour,
} from '../../src/utils/coachTimes';

describe('roundToQuarterHour', () => {
  it.each([
    ['08:00', '08:00'],
    ['08:07', '08:00'],
    ['08:08', '08:15'],
    ['19:53', '20:00'],
    ['23:59', '23:45'],
  ])('rounds %s to %s', (input, expected) => {
    expect(roundToQuarterHour(input)).toBe(expected);
  });
});

describe('normalizeCheckinTimes', () => {
  it('rounds, drops repeats and sorts', () => {
    expect(normalizeCheckinTimes(['19:02', '08:00', '19:07', '13:14'])).toEqual(
      ['08:00', '13:15', '19:00']
    );
  });
});

describe('dayFromNow', () => {
  it('adds days to the local calendar day, across a month end', () => {
    const now = new Date(2026, 10, 28, 23, 30);
    expect(dayFromNow(0, now)).toBe('2026-11-28');
    expect(dayFromNow(3, now)).toBe('2026-12-01');
    expect(dayFromNow(14, now)).toBe('2026-12-12');
  });
});
