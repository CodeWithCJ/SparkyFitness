import type { TFunction } from 'i18next';
import {
  MAX_EFFORT_METERS,
  MIN_EFFORT_METERS,
  addDays,
  classifyActivitySport,
  paceZones,
  thresholdPaceFromEffort,
  type ExerciseActivityQueryItem,
  type FitnessTestResponse,
  type PaceZone,
  type PaceZoneId,
} from '@workspace/shared';
import { referencePace } from './suggestedRanges';

/** Efforts older than this say little about today's fitness. */
const EFFORT_WINDOW_DAYS = 90;
/** Typical pace is an average over easy and hard days, so threshold is well under it. */
const THRESHOLD_FROM_TYPICAL = 0.9;

export interface PaceZonesResult {
  /** Seconds per km the zones are built around. */
  thresholdSecondsPerKm: number;
  zones: PaceZone[];
  /**
   * `test` when the person's latest fitness test set the reference; `effort`
   * when a recent hard run did; `typical` when only an average of recent runs
   * was available, which is less precise.
   */
  source: 'test' | 'effort' | 'typical';
  /** Runs the reference was drawn from. */
  sessions: number;
}

/** The zone's name in the app language. */
export function paceZoneName(t: TFunction, id: PaceZoneId): string {
  switch (id) {
    case 'easy':
      return t('exerciseStatistics.paceZones.easy', { defaultValue: 'Easy' });
    case 'steady':
      return t('exerciseStatistics.paceZones.steady', {
        defaultValue: 'Steady',
      });
    case 'threshold':
      return t('exerciseStatistics.paceZones.threshold', {
        defaultValue: 'Threshold',
      });
    case 'interval':
      return t('exerciseStatistics.paceZones.interval', {
        defaultValue: 'Interval',
      });
    default:
      return t('exerciseStatistics.paceZones.repetition', {
        defaultValue: 'Repetition',
      });
  }
}

/**
 * Pace zones from the person's latest fitness test, which beat any estimate
 * from their runs. `shift` re-paces them like `paceZonesFromSessions` does.
 */
export function paceZonesFromTest(
  test: FitnessTestResponse | null,
  shift = 0
): PaceZonesResult | null {
  if (!test) return null;
  const threshold = test.paces.thresholdSecondsPerKm;
  const zones = paceZones(threshold, shift);
  if (!zones) return null;
  return {
    thresholdSecondsPerKm: threshold,
    zones,
    source: 'test',
    sessions: 0,
  };
}

const isOutdoorRun = (item: ExerciseActivityQueryItem): boolean =>
  item.hasGpsTrack &&
  classifyActivitySport({
    exerciseName: item.exerciseName,
    category: item.category,
    notes: item.notes,
  }).sport === 'running';

/**
 * Pace zones for the person's running, from their cardio sessions. The best
 * outdoor run of 3 to 25 km in the last 90 days sets the threshold pace
 * (Riegel carried to an hour). Without one, an average of recent runs is
 * used instead, labelled as less precise. Null when there are no usable runs.
 */
export function paceZonesFromSessions(
  sessions: readonly ExerciseActivityQueryItem[],
  today: string,
  shift = 0
): PaceZonesResult | null {
  const earliest = addDays(today, -EFFORT_WINDOW_DAYS);
  const runs = sessions.filter(
    (item) => item.entryDate >= earliest && isOutdoorRun(item)
  );
  let best: number | null = null;
  let used = 0;
  for (const item of runs) {
    const meters = item.distanceMeters ?? 0;
    const pace = item.avgPaceSecondsPerKm ?? 0;
    if (meters < MIN_EFFORT_METERS || meters > MAX_EFFORT_METERS || pace <= 0) {
      continue;
    }
    used++;
    const threshold = thresholdPaceFromEffort(meters, (meters / 1000) * pace);
    if (threshold != null && (best == null || threshold < best))
      best = threshold;
  }
  let source: PaceZonesResult['source'] = 'effort';
  if (best == null) {
    const typical = referencePace(sessions, 'run', today);
    if (!typical) return null;
    best = typical.secondsPerKm * THRESHOLD_FROM_TYPICAL;
    used = typical.sessions;
    source = 'typical';
  }
  const zones = paceZones(best, shift);
  if (!zones) return null;
  return { thresholdSecondsPerKm: best, zones, source, sessions: used };
}
