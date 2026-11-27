import { roundToQuarterHour } from '@/utils/coachTimes';

describe('roundToQuarterHour', () => {
  it.each([
    ['08:00', '08:00'],
    ['08:07', '08:00'],
    ['08:08', '08:15'],
    ['08:22', '08:15'],
    ['08:23', '08:30'],
    ['19:53', '20:00'],
    ['00:03', '00:00'],
  ])('rounds %s to %s', (input, expected) => {
    expect(roundToQuarterHour(input)).toBe(expected);
  });

  it('never goes past the last quarter hour of the day', () => {
    expect(roundToQuarterHour('23:59')).toBe('23:45');
  });
});
