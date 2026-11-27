/** Check-ins are on the quarter hour: round what the time sheet gives. */
export function roundToQuarterHour(time: string): string {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const total = Math.min(
    23 * 60 + 45,
    Math.round((hour * 60 + minute) / 15) * 15
  );
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** The check-in times as the server wants them: rounded, unique, in order. */
export function normalizeCheckinTimes(times: readonly string[]): string[] {
  return [...new Set(times.map(roundToQuarterHour))].sort();
}

/** Today plus `days`, as a calendar day in the device's own zone. */
export function dayFromNow(days: number, now: Date = new Date()): string {
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + days
  );
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
