const DAY_MS = 24 * 60 * 60 * 1000;

/** Windows up to this many days show every reading; longer ones show daily averages. */
export const DETAILED_MAX_DAYS = 3;

export interface DayWindow {
  /** First day, inclusive (`YYYY-MM-DD`). */
  start: string;
  /** Last day, inclusive (`YYYY-MM-DD`). */
  end: string;
}

export const dayStringToMs = (day: string): number =>
  Date.parse(`${day}T00:00:00Z`);

export const msToDayString = (ms: number): string => {
  const d = new Date(ms);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const date = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}-${date}`;
};

export const windowDayCount = (window: DayWindow): number =>
  Math.round(
    (dayStringToMs(window.end) - dayStringToMs(window.start)) / DAY_MS
  ) + 1;

export const isDetailedWindow = (window: DayWindow): boolean =>
  windowDayCount(window) <= DETAILED_MAX_DAYS;

/** Brush selection in ms: start of the first day to the end of the last day. */
export const windowToSelectionMs = (
  window: DayWindow
): { startMs: number; endMs: number } => ({
  startMs: dayStringToMs(window.start),
  endMs: dayStringToMs(window.end) + DAY_MS,
});

/**
 * Snaps a brush selection (ms) to whole days inside `range`, keeping at
 * least one day selected.
 */
export const selectionMsToWindow = (
  startMs: number,
  endMs: number,
  range: DayWindow
): DayWindow => {
  const minDay = dayStringToMs(range.start);
  const maxDay = dayStringToMs(range.end);
  const startDay = Math.round(startMs / DAY_MS) * DAY_MS;
  const endDay = Math.round(endMs / DAY_MS) * DAY_MS - DAY_MS;
  const start = Math.min(Math.max(startDay, minDay), maxDay);
  const end = Math.min(Math.max(endDay, start), maxDay);
  return { start: msToDayString(start), end: msToDayString(end) };
};

/** The last `days` days of `range`, for the 24H / 3D / 7D presets. */
export const lastDaysWindow = (range: DayWindow, days: number): DayWindow => {
  const endMs = dayStringToMs(range.end);
  const startMs = Math.max(
    dayStringToMs(range.start),
    endMs - (Math.max(1, days) - 1) * DAY_MS
  );
  return { start: msToDayString(startMs), end: range.end };
};

/** Moves a window by whole days without leaving `range`, keeping its width. */
export const shiftWindow = (
  window: DayWindow,
  days: number,
  range: DayWindow
): DayWindow => {
  const width = windowDayCount(window) - 1;
  const minStart = dayStringToMs(range.start);
  const maxStart = Math.max(
    minStart,
    dayStringToMs(range.end) - width * DAY_MS
  );
  const start = Math.min(
    Math.max(dayStringToMs(window.start) + days * DAY_MS, minStart),
    maxStart
  );
  return {
    start: msToDayString(start),
    end: msToDayString(start + width * DAY_MS),
  };
};
