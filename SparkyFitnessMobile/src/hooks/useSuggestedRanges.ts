import { useMemo } from 'react';
import { calculateAge, paceZone } from '@workspace/shared';
import type {
  HeartRateBand,
  PaceBand,
  PaceReferenceRace,
  StepEffort,
} from '@workspace/shared';
import { useCardioSessions } from './useCardioSessions';
import { usePreferences } from './usePreferences';
import { useProfile } from './useProfile';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import { paceZonesFromSessions } from '../utils/paceZones';
import type { RecordingActivity } from '../utils/gpsRecording';
import {
  estimateMaxHeartRate,
  referencePace,
  suggestedHeartRateRanges,
  suggestedPaceRanges,
  suggestedPaceRangesFromRace,
  warmPaceFromEasy,
  type SuggestedPair,
} from '../utils/suggestedRanges';

export interface SuggestedRanges {
  /**
   * Fast, easy and warm-up pace ranges, from the person's recent race when they
   * have set one (`race`), else from their pace zones or recent sessions
   * (`sessions`); null without any.
   */
  pace:
    | (SuggestedPair<PaceBand> & {
        sessions: number;
        race: PaceReferenceRace | null;
      })
    | null;
  /** Ranges for tempo, marathon-pace and stride efforts; only from a race. */
  byEffort: Partial<Record<StepEffort, PaceBand>> | null;
  /** Fast, easy and warm-up heart-rate ranges from the person's age, or null without a birth date. */
  heartRate: (SuggestedPair<HeartRateBand> & { maxHeartRate: number }) | null;
}

/**
 * Ranges to offer for a plan's fast and easy stretches and its warm-up and
 * cool-down: pace from a recent race result when the person has set one, else
 * from their pace zones, else from the last couple of months of outdoor
 * sessions of the same sport; heart rate from the estimated maximum for the
 * person's age. Reads the sessions the cardio view already loads, and only
 * when `enabled`.
 *
 * Without a race, a run's pace comes from the person's pace zones (fast
 * stretches in the interval zone, easy ones in the easy zone), so it follows
 * their fitness. `paceShift` re-paces them from how the last workouts felt:
 * positive slows every zone (after two hard efforts), negative speeds them up.
 * Without enough runs for zones, a run falls back to the typical-pace estimate.
 */
export function useSuggestedRanges(
  activity: RecordingActivity,
  enabled: boolean,
  paceShift = 0
): SuggestedRanges {
  const { profile } = useProfile();
  const { preferences } = usePreferences();
  const race = useAppPreferencesStore((s) => s.paceReferenceRace);
  const { sessions } = useCardioSessions('90d', enabled && activity !== 'ride');
  const dateOfBirth = profile?.date_of_birth ?? null;
  const timezone = preferences?.timezone ?? undefined;

  return useMemo(() => {
    const fromRace = race ? suggestedPaceRangesFromRace(race, activity) : null;
    const reference =
      activity === 'ride' || fromRace
        ? null
        : referencePace(sessions, activity, getTodayDate());
    const zones =
      activity === 'run'
        ? paceZonesFromSessions(sessions, getTodayDate(), paceShift)
        : null;
    const interval = zones && paceZone(zones.zones, 'interval');
    const easy = zones && paceZone(zones.zones, 'easy');
    const pace =
      zones && interval && easy
        ? { work: interval, easy, warm: warmPaceFromEasy(easy) }
        : reference
          ? suggestedPaceRanges(reference, activity)
          : null;
    const maxHeartRate = dateOfBirth
      ? estimateMaxHeartRate(calculateAge(dateOfBirth, timezone))
      : null;
    return {
      pace: fromRace
        ? { ...fromRace.pair, sessions: 0, race }
        : pace && (zones || reference)
          ? {
              work: {
                minSecondsPerKm: pace.work.minSecondsPerKm,
                maxSecondsPerKm: pace.work.maxSecondsPerKm,
              },
              easy: {
                minSecondsPerKm: pace.easy.minSecondsPerKm,
                maxSecondsPerKm: pace.easy.maxSecondsPerKm,
              },
              warm: {
                minSecondsPerKm: pace.warm.minSecondsPerKm,
                maxSecondsPerKm: pace.warm.maxSecondsPerKm,
              },
              sessions: zones?.sessions ?? reference?.sessions ?? 0,
              race: null,
            }
          : null,
      byEffort: fromRace ? fromRace.byEffort : null,
      heartRate: maxHeartRate
        ? { ...suggestedHeartRateRanges(maxHeartRate), maxHeartRate }
        : null,
    };
  }, [activity, sessions, dateOfBirth, timezone, paceShift, race]);
}
