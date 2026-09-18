const HOUR_MS = 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Upper bound on pending reminders; iOS caps an app at 64 pending notifications. */
export const MAX_SCHEDULED_WATER_REMINDERS = 12;

/** An already-overdue reminder fires this long from now rather than in the past. */
export const MIN_REMINDER_LEAD_MS = 60_000;

export interface ReminderScheduleInput {
  lastLoggedAt: Date | null;
  now: Date;
  intervalHours: number;
  windowStart: string;
  windowEnd: string;
  goalMetToday: boolean;
}

function atTimeOnDay(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(day.getTime());
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function nextDayAt(day: Date, time: string): Date {
  const result = new Date(day.getTime());
  result.setDate(result.getDate() + 1);
  return atTimeOnDay(result, time);
}

function fitIntoWindow(
  time: Date,
  windowStart: string,
  windowEnd: string
): Date {
  const start = atTimeOnDay(time, windowStart);
  if (time.getTime() < start.getTime()) return start;
  const end = atTimeOnDay(time, windowEnd);
  if (time.getTime() >= end.getTime()) return nextDayAt(time, windowStart);
  return time;
}

/**
 * Upcoming reminder times, each inside `[windowStart, windowEnd)` on its own
 * day. A chain rather than one time because a scheduled notification cannot
 * reschedule itself: without the app running, one ping would be the last.
 */
export function computeReminderSchedule({
  lastLoggedAt,
  now,
  intervalHours,
  windowStart,
  windowEnd,
  goalMetToday,
}: ReminderScheduleInput): Date[] {
  const intervalMs = intervalHours * HOUR_MS;

  let next: Date;
  if (goalMetToday) {
    next = nextDayAt(now, windowStart);
  } else {
    const todayStartMs = atTimeOnDay(now, windowStart).getTime();
    const anchorMs = Math.max(
      lastLoggedAt?.getTime() ?? todayStartMs,
      todayStartMs
    );
    next = fitIntoWindow(
      new Date(
        Math.max(anchorMs + intervalMs, now.getTime() + MIN_REMINDER_LEAD_MS)
      ),
      windowStart,
      windowEnd
    );
  }

  const times = [next];
  while (times.length < MAX_SCHEDULED_WATER_REMINDERS) {
    next = fitIntoWindow(
      new Date(next.getTime() + intervalMs),
      windowStart,
      windowEnd
    );
    times.push(next);
  }
  return times;
}

/** Same-day windows only: overnight windows are not supported. */
export function isValidReminderWindow(start: string, end: string): boolean {
  return TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && end > start;
}

export function latestLoggedAt(
  entries: readonly { logged_at: string }[] | undefined
): Date | null {
  let latestMs: number | null = null;
  for (const entry of entries ?? []) {
    const ms = new Date(entry.logged_at).getTime();
    if (Number.isNaN(ms)) continue;
    if (latestMs === null || ms > latestMs) latestMs = ms;
  }
  return latestMs === null ? null : new Date(latestMs);
}
