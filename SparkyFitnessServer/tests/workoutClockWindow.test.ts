import { describe, expect, it } from 'vitest';
import { workoutClockWindow } from '@workspace/shared';

describe('workoutClockWindow', () => {
  it('spans the start time for the duration, in the fallback zone', () => {
    expect(
      workoutClockWindow(
        {
          entry_date: '2026-11-02',
          entry_time: '12:00:00',
          duration_minutes: 45,
        },
        'America/New_York'
      )
    ).toEqual({
      startMs: Date.parse('2026-11-02T17:00:00Z'),
      endMs: Date.parse('2026-11-02T17:45:00Z'),
    });
  });

  it('prefers the zone the workout was recorded in', () => {
    expect(
      workoutClockWindow(
        {
          entry_date: '2026-11-02',
          entry_time: '12:00',
          record_timezone: 'Europe/London',
          duration_minutes: 10,
        },
        'America/New_York'
      )?.startMs
    ).toBe(Date.parse('2026-11-02T12:00:00Z'));
  });

  it('falls back when the recorded zone is not valid', () => {
    expect(
      workoutClockWindow(
        {
          entry_date: '2026-11-02',
          entry_time: '12:00',
          record_timezone: 'Not/AZone',
          duration_minutes: 10,
        },
        'UTC'
      )?.startMs
    ).toBe(Date.parse('2026-11-02T12:00:00Z'));
  });

  it('is null without a start time or a duration', () => {
    expect(
      workoutClockWindow(
        { entry_date: '2026-11-02', entry_time: null, duration_minutes: 10 },
        'UTC'
      )
    ).toBeNull();
    expect(
      workoutClockWindow(
        {
          entry_date: '2026-11-02',
          entry_time: '12:00',
          duration_minutes: null,
        },
        'UTC'
      )
    ).toBeNull();
    expect(workoutClockWindow(null, 'UTC')).toBeNull();
  });
});
