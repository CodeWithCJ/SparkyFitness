export type SyncDuration = 'today' | '24h' | '3d' | '7d' | '30d' | '90d' | '180d' | '365d';

// SyncInterval represents how often to sync (background sync frequency)
// Note: '24h' appears in both types - SyncDuration for data range, SyncInterval for frequency
export type SyncInterval = '1h' | '4h' | '24h';

/**
 * Returns a copy of `date` rounded down to local midnight. Day-aggregated reads on
 * both platforms must align their query starts to a local-day boundary: HC's
 * aggregateGroupByPeriod anchors DAYS buckets at the supplied start, and HealthKit
 * day-statistics reads emit full-day values that would otherwise overwrite complete
 * server days with partial-window slices.
 */
export const alignToLocalDayStart = (date: Date): Date => {
  const aligned = new Date(date);
  aligned.setHours(0, 0, 0, 0);
  return aligned;
};

/**
 * Returns a copy of `date` rounded up to the next local midnight (unchanged when
 * already midnight-aligned). The lower edge of an already-covered span must round
 * this way: rounding it down would mark hours that were never imported as covered.
 */
export const ceilToLocalDayStart = (date: Date): Date => {
  const aligned = alignToLocalDayStart(date);
  return aligned.getTime() === date.getTime() ? aligned : addLocalDays(aligned, 1);
};

/**
 * The read windows for one sync run. Raw/session reads use the exact requested
 * window; day-aggregated reads (cumulative totals, min/max/avg day statistics) use
 * the day-aligned start so complete daily values are sent, never partial slices.
 */
export interface SyncWindows {
  sessionStart: Date;
  aggregatedStart: Date;
  end: Date;
  /**
   * Set by buildBackgroundWindows only when MAX_BACKGROUND_LOOKBACK_DAYS
   * shortened the window: the start that was requested but not honoured. The
   * span between this and sessionStart is what the background task will not
   * read, and needs a manual sync or History Import to recover.
   */
  clampedFrom?: Date;
}

export const buildForegroundWindows = (duration: SyncDuration): SyncWindows => {
  const sessionStart = getSyncStartDate(duration);
  return {
    sessionStart,
    aggregatedStart: alignToLocalDayStart(sessionStart),
    end: new Date(),
  };
};

/**
 * Adds `days` calendar days via setDate (never ms math), so crossing a DST
 * transition still lands on the same wall-clock time instead of 23:00/01:00.
 */
export const addLocalDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Number of calendar days in [start, end). Both inputs are aligned to local
 * midnight first, so DST-shortened/lengthened days still count as one day.
 */
export const countLocalDays = (start: Date, end: Date): number => {
  let count = 0;
  let cursor = alignToLocalDayStart(start);
  const endAligned = alignToLocalDayStart(end);
  while (cursor < endAligned) {
    cursor = addLocalDays(cursor, 1);
    count++;
  }
  return count;
};

/**
 * Windows for a historical backfill span whose edges are both local midnights,
 * so session and day-aggregated reads share the same boundaries.
 */
export const buildBackfillWindows = (start: Date, end: Date): SyncWindows => ({
  sessionStart: start,
  aggregatedStart: start,
  end,
});

/**
 * Partitions [floor, endEdge) into day-aligned windows of at most `maxDays`
 * calendar days, ordered newest-first so an interrupted walk keeps the most
 * recent history. The oldest window may be short. Returns [] when
 * floor >= endEdge (Health Connect rejects start >= end windows).
 */
export const enumerateDayAlignedWindows = (
  floor: Date,
  endEdge: Date,
  maxDays: number,
): { start: Date; end: Date }[] => {
  const windows: { start: Date; end: Date }[] = [];
  const floorAligned = alignToLocalDayStart(floor);
  let end = alignToLocalDayStart(endEdge);

  while (end > floorAligned) {
    const start = addLocalDays(end, -maxDays);
    windows.push({ start: start > floorAligned ? start : floorAligned, end });
    end = start;
  }

  return windows;
};

// Health records (sleep, workouts, etc.) can arrive in HealthKit/Health Connect hours
// after the event. Background windows overlap session queries by this amount so
// late-arriving records whose event timestamps fall before lastSyncedTime are still
// picked up. The server upserts by record identity, so duplicates are harmless.
export const SESSION_OVERLAP_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Floor on how far back a background run will read.
 *
 * The cursor only advances when a run finishes with no read errors, so a
 * persistently failing sync holds it in place while `now` keeps moving — each
 * run then reads a wider window than the last, takes longer, and is more likely
 * to fail again. Observed in #2191 as background runs reading 12- and 27-day
 * windows for a sync whose nominal window is `lastSynced − 6h`. Clamping breaks
 * the ratchet; a genuinely long gap is the history-import backfill's job, not
 * the background task's.
 */
export const MAX_BACKGROUND_LOOKBACK_DAYS = 14;

export const buildBackgroundWindows = (lastSyncedTime: string | null, now: Date = new Date()): SyncWindows => {
  const lastSynced = lastSyncedTime
    ? new Date(lastSyncedTime)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const requestedStart = new Date(lastSynced.getTime() - SESSION_OVERLAP_MS);
  const floor = new Date(
    now.getTime() - MAX_BACKGROUND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  // An unparseable cursor would make every comparison false and leave an
  // Invalid Date in the window, so fall back to the floor. Validity is tracked
  // separately from the floor comparison: an invalid cursor is not a "clamped"
  // window, and reporting it as one hands the caller an Invalid Date to format.
  const hasValidRequestedStart = Number.isFinite(requestedStart.getTime());
  // >= so a start exactly on the floor is not reported as shortened.
  const withinFloor = hasValidRequestedStart && requestedStart >= floor;
  const sessionStart = withinFloor ? requestedStart : floor;
  return {
    sessionStart,
    aggregatedStart: alignToLocalDayStart(sessionStart),
    end: now,
    // Set only when the clamp actually shortened the window, so the caller can
    // tell the user which span the background task will not cover. Reported as
    // data rather than logged here to keep these date helpers side-effect free.
    ...(hasValidRequestedStart && !withinFloor ? { clampedFrom: requestedStart } : {}),
  };
};

/**
 * Calculates the start date for a sync operation based on the specified duration.
 * For 'today', returns midnight of the current day.
 * For '24h', returns exactly 24 hours ago (rolling window).
 * For other durations, returns midnight of the calculated start day.
 */
export const getSyncStartDate = (duration: SyncDuration): Date => {
  const now = new Date();
  let startDate = new Date(now);

  switch (duration) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      break;
    case '24h':
      // True rolling 24h window - exactly 24 hours ago
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '3d':
      startDate.setDate(now.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 89);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '180d':
      startDate.setDate(now.getDate() - 179);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '365d':
      startDate.setDate(now.getDate() - 364);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }
  return startDate;
};
