import {
  MAX_SCHEDULED_WATER_REMINDERS,
  computeReminderSchedule,
  isValidReminderWindow,
  latestLoggedAt,
  type ReminderScheduleInput,
} from '../../src/utils/hydrationReminder';

const at = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 8, day, hours, minutes, 0, 0);

function input(
  overrides: Partial<ReminderScheduleInput>
): ReminderScheduleInput {
  return {
    lastLoggedAt: null,
    now: at(15, 12),
    intervalHours: 2,
    windowStart: '08:00',
    windowEnd: '22:00',
    goalMetToday: false,
    ...overrides,
  };
}

describe('computeReminderSchedule', () => {
  it('reminds one interval after the last log', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 12), lastLoggedAt: at(15, 11) })
    );
    expect(times[0]).toEqual(at(15, 13));
  });

  it('counts from the window start when nothing was logged today', () => {
    const times = computeReminderSchedule(input({ now: at(15, 9) }));
    expect(times[0]).toEqual(at(15, 10));
  });

  it('never anchors today on a log from a previous day', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 9), lastLoggedAt: at(14, 21) })
    );
    expect(times[0]).toEqual(at(15, 10));
  });

  it('fires one minute from now when the reminder is already overdue', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 15), lastLoggedAt: at(15, 9) })
    );
    expect(times[0]).toEqual(at(15, 15, 1));
  });

  it("rolls past the window end to tomorrow's window start", () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 21, 30), lastLoggedAt: at(15, 21) })
    );
    expect(times[0]).toEqual(at(16, 8));
  });

  it('treats the window end as exclusive', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 20), lastLoggedAt: at(15, 20) })
    );
    expect(times[0]).toEqual(at(16, 8));
  });

  it("moves a reminder that lands after midnight to that morning's window start", () => {
    const times = computeReminderSchedule(
      input({
        now: at(15, 23),
        lastLoggedAt: at(15, 23),
        intervalHours: 1,
        windowEnd: '23:30',
      })
    );
    expect(times[0]).toEqual(at(16, 8));
  });

  it("starts at tomorrow's window start once today's goal is met", () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 12), lastLoggedAt: at(15, 11), goalMetToday: true })
    );
    expect(times[0]).toEqual(at(16, 8));
  });

  it('schedules a bounded, ascending chain that stays inside the window', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 19), lastLoggedAt: at(15, 19) })
    );
    expect(times).toHaveLength(MAX_SCHEDULED_WATER_REMINDERS);
    expect(times[0]).toEqual(at(15, 21));
    expect(times[1]).toEqual(at(16, 8));
    expect(times[2]).toEqual(at(16, 10));
    for (let i = 0; i < times.length; i += 1) {
      const minutes = times[i].getHours() * 60 + times[i].getMinutes();
      expect(minutes).toBeGreaterThanOrEqual(8 * 60);
      expect(minutes).toBeLessThan(22 * 60);
      if (i > 0) {
        expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
      }
    }
  });

  it('terminates when the window is shorter than the interval', () => {
    const times = computeReminderSchedule(
      input({ now: at(15, 7), windowStart: '08:00', windowEnd: '09:00' })
    );
    expect(times).toHaveLength(MAX_SCHEDULED_WATER_REMINDERS);
    expect(times[0]).toEqual(at(16, 8));
    expect(times[1]).toEqual(at(17, 8));
  });
});

describe('isValidReminderWindow', () => {
  it('accepts an end strictly after the start', () => {
    expect(isValidReminderWindow('08:00', '22:00')).toBe(true);
  });

  it('rejects an equal or earlier end', () => {
    expect(isValidReminderWindow('08:00', '08:00')).toBe(false);
    expect(isValidReminderWindow('22:00', '08:00')).toBe(false);
  });

  it('rejects malformed times', () => {
    expect(isValidReminderWindow('8:00', '22:00')).toBe(false);
    expect(isValidReminderWindow('08:00', '24:00')).toBe(false);
  });
});

describe('latestLoggedAt', () => {
  it('returns the most recent logged_at', () => {
    expect(
      latestLoggedAt([
        { logged_at: '2026-09-15T08:00:00.000Z' },
        { logged_at: '2026-09-15T10:30:00.000Z' },
        { logged_at: '2026-09-15T09:15:00.000Z' },
      ])
    ).toEqual(new Date('2026-09-15T10:30:00.000Z'));
  });

  it('ignores unparseable timestamps', () => {
    expect(
      latestLoggedAt([
        { logged_at: 'not-a-date' },
        { logged_at: '2026-09-15T08:00:00.000Z' },
      ])
    ).toEqual(new Date('2026-09-15T08:00:00.000Z'));
  });

  it('returns null with no entries', () => {
    expect(latestLoggedAt([])).toBeNull();
    expect(latestLoggedAt(undefined)).toBeNull();
  });
});
