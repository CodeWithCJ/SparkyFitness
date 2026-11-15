/**
 * Time helpers for the Diary's modeled-curve cards (active caffeine). Their
 * charts and labels describe the diary day on screen,
 * which is often not today, so every time is told relative to that day.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Local HH:MM for an instant, in the viewer's own zone. */
export const clockLabel = (instant: string | number) =>
  new Date(instant).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

/** Local midnight of a YYYY-MM-DD day, or null when the string is not a day. */
export const localDayStartMs = (dateStr: string): number | null => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d, 0, 0, 0, 0).getTime() : null;
};

/** Whole local days from `dayStartMs` to the day `instant` falls on. */
const daysFrom = (dayStartMs: number, instant: number) => {
  const d = new Date(instant);
  const instantMidnight = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
  return Math.round((instantMidnight - dayStartMs) / DAY_MS);
};

/**
 * Formats an instant relative to the diary day being viewed (YYYY-MM-DD).
 * - Same day: "HH:MM"
 * - Yesterday: "Yesterday, HH:MM"
 * - Tomorrow: "Tomorrow, HH:MM"
 * - Other days: "MMM D, HH:MM"
 */
export const formatRelativeDateTime = (
  instant: string | number | Date,
  viewedDateStr: string,
  labels?: {
    yesterday?: string;
    tomorrow?: string;
  }
) => {
  const d = instant instanceof Date ? instant : new Date(instant);
  const time = clockLabel(d.getTime());

  const viewedMidnight = localDayStartMs(viewedDateStr);
  if (viewedMidnight === null) return time;

  const diffDays = daysFrom(viewedMidnight, d.getTime());
  if (diffDays === 0) {
    return time;
  }
  if (diffDays === -1) {
    const yLabel = labels?.yesterday || 'Yesterday';
    return `${yLabel}, ${time}`;
  }
  if (diffDays === 1) {
    const tLabel = labels?.tomorrow || 'Tomorrow';
    return `${tLabel}, ${time}`;
  }
  const dateStr = d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
  return `${dateStr}, ${time}`;
};

/**
 * An axis tick relative to the viewed day: a bare HH:MM on that day, the date
 * at another day's midnight, otherwise "+1d HH:MM" / "-1d HH:MM".
 */
export const formatDayRelativeTick = (
  instant: number,
  dayStartMs: number | null
) => {
  if (dayStartMs === null) return clockLabel(instant);
  const d = new Date(instant);
  const diffDays = daysFrom(dayStartMs, instant);

  const time = clockLabel(instant);
  if (diffDays === 0) {
    return time;
  }
  if (d.getHours() === 0 && d.getMinutes() === 0) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  if (diffDays > 0) {
    return `+${diffDays}d ${time}`;
  }
  return `${diffDays}d ${time}`;
};

/** Ticks on each full hour from `start` to `end`, both included. */
export const hourlyTicks = (start: number, end: number): number[] => {
  const startDate = new Date(start);
  const remainderMs =
    (startDate.getMinutes() * 60 + startDate.getSeconds()) * 1000 +
    startDate.getMilliseconds();
  const first = remainderMs === 0 ? start : start + (HOUR_MS - remainderMs);
  const ticks: number[] = [];
  for (let t = first; t <= end; t += HOUR_MS) ticks.push(t);
  return ticks;
};
