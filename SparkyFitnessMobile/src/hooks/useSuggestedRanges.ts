import { useMemo } from 'react';
import { paceZone } from '@workspace/shared';
import type {
  FitnessTestResponse,
  HeartRateBand,
  HeartRateZonesResponse,
  PaceBand,
  PaceReferenceRace,
  StepEffort,
} from '@workspace/shared';
import { useCardioSessions } from './useCardioSessions';
import { useHeartRateZones } from './useHeartRateZones';
import { useFitnessTests } from '../services/fitnessTestService';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import { paceZonesFromSessions } from '../utils/paceZones';
import type { RecordingActivity } from '../utils/gpsRecording';
import {
  referencePace,
  suggestedHeartRateRanges,
  suggestedPaceRanges,
  suggestedPaceRangesFromRace,
  suggestedPaceRangesFromTest,
  warmPaceFromEasy,
  type SuggestedPair,
} from '../utils/suggestedRanges';

export interface SuggestedRanges {
  /**
   * Fast, easy and warm-up pace ranges, from the person's latest fitness test
   * when they have one (`fitnessTest`), else from the recent race they have
   * set (`race`), else from their pace zones or recent sessions (`sessions`);
   * null without any.
   */
  pace:
    | (SuggestedPair<PaceBand> & {
        sessions: number;
        race: PaceReferenceRace | null;
        fitnessTest: FitnessTestResponse | null;
      })
    | null;
  /** Ranges for tempo, marathon-pace and stride efforts; only from a fitness test or a race. */
  byEffort: Partial<Record<StepEffort, PaceBand>> | null;
  /** Fast, easy and warm-up heart-rate ranges from the person's age, or null without a birth date. */
  heartRate:
    | (SuggestedPair<HeartRateBand> & {
        maxHeartRate: number;
        /** Where the max came from and how the zones were worked out. */
        maxHrSource: HeartRateZonesResponse['resolved']['max_hr_source'];
        zoneMethod: HeartRateZonesResponse['resolved']['effective_method'];
      })
    | null;
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
  const race = useAppPreferencesStore((s) => s.paceReferenceRace);
  const { latest: fitnessTest } = useFitnessTests(
    enabled && activity === 'run'
  );
  const { sessions } = useCardioSessions('90d', enabled && activity !== 'ride');
  const { zones: heartRateZones } = useHeartRateZones(enabled);

  return useMemo(() => {
    const fromTest = fitnessTest
      ? suggestedPaceRangesFromTest(fitnessTest.paces, activity, paceShift)
      : null;
    const fromRace =
      !fromTest && race ? suggestedPaceRangesFromRace(race, activity) : null;
    const reference =
      activity === 'ride' || fromRace || fromTest
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
    // Without a date of birth or a max heart rate of their own there is only a
    // typical figure to go on, which is not worth suggesting a range from.
    // Custom zones carry floors the person typed, so they need no max.
    const resolved = heartRateZones?.resolved;
    const knownMax =
      resolved &&
      (resolved.effective_method === 'custom' ||
        resolved.max_hr_source === 'user' ||
        resolved.max_hr_source === 'age');
    return {
      pace: fromTest
        ? { ...fromTest.pair, sessions: 0, race: null, fitnessTest }
        : fromRace
          ? { ...fromRace.pair, sessions: 0, race, fitnessTest: null }
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
                fitnessTest: null,
              }
            : null,
      byEffort: fromTest
        ? fromTest.byEffort
        : fromRace
          ? fromRace.byEffort
          : null,
      heartRate:
        resolved && knownMax
          ? {
              ...suggestedHeartRateRanges(
                resolved.zones.map((zone) => zone.lower_bpm)
              ),
              maxHeartRate: resolved.max_hr,
              maxHrSource: resolved.max_hr_source,
              zoneMethod: resolved.effective_method,
            }
          : null,
    };
  }, [activity, sessions, heartRateZones, paceShift, race, fitnessTest]);
}
