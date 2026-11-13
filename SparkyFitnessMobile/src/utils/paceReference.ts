import type { TFunction } from 'i18next';
import {
  PACE_REFERENCE_RACES,
  type PaceReferenceRace,
  type PaceReferenceRaceId,
} from '@workspace/shared';
import { formatClock } from './gpsRecording';

/** The race id for a distance, or null when it is not one of the standard races. */
export function raceIdForDistance(
  distanceKm: number
): PaceReferenceRaceId | null {
  return (
    PACE_REFERENCE_RACES.find((r) => Math.abs(r.distanceKm - distanceKm) < 0.01)
      ?.id ?? null
  );
}

/** "5K", "10K", "Half marathon" or "Marathon"; a distance that is none of them reads as kilometres. */
export function raceDistanceName(
  t: TFunction,
  id: PaceReferenceRaceId
): string {
  switch (id) {
    case '5k':
      return t('paceReference.race.5k', { defaultValue: '5K' });
    case '10k':
      return t('paceReference.race.10k', { defaultValue: '10K' });
    case 'half':
      return t('paceReference.race.half', { defaultValue: 'Half marathon' });
    case 'marathon':
      return t('paceReference.race.marathon', { defaultValue: 'Marathon' });
  }
}

/** "5K in 25:00" for a recent race. */
export function raceResultText(t: TFunction, race: PaceReferenceRace): string {
  const id = raceIdForDistance(race.distanceKm);
  return t('paceReference.result', {
    race: id
      ? raceDistanceName(t, id)
      : t('paceReference.race.other', {
          km: race.distanceKm,
          defaultValue: '{{km}} km',
        }),
    time: formatClock(race.seconds),
    defaultValue: '{{race}} in {{time}}',
  });
}
