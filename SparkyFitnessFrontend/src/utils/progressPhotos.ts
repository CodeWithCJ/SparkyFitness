import {
  formatSignedWeightChange,
  PHOTO_TYPES,
  type PhotoType,
  type ProgressPhotoDay,
} from '@workspace/shared';
import { kgToLbs } from '@/utils/unitConversions';

/** The three angles in display order, with their translation keys. */
export const PHOTO_ANGLES: {
  type: PhotoType;
  labelKey: string;
  defaultLabel: string;
}[] = [
  { type: 'front', labelKey: 'checkIn.photos.front', defaultLabel: 'Front' },
  { type: 'back', labelKey: 'checkIn.photos.back', defaultLabel: 'Back' },
  { type: 'side', labelKey: 'checkIn.photos.side', defaultLabel: 'Side' },
];

/**
 * The angle to open on: the one with the most shoots, so the dialog starts on
 * something playable. Ties go to the usual Front, Back, Side order.
 */
export const defaultAngle = (days: ProgressPhotoDay[]): PhotoType => {
  let best: PhotoType = PHOTO_TYPES[0];
  let bestCount = -1;
  for (const angle of PHOTO_TYPES) {
    const count = days.filter((day) => day.photos[angle]).length;
    if (count > bestCount) {
      best = angle;
      bestCount = count;
    }
  }
  return best;
};

/** Whether any angle has two shoots to compare or play back. */
export const hasComparableAngle = (days: ProgressPhotoDay[]): boolean =>
  PHOTO_TYPES.some(
    (angle) => days.filter((day) => day.photos[angle]).length >= 2
  );

/**
 * A signed weight change for the comparison badge, e.g. "-4.3 kg". Stone users
 * get pounds: a change of a few pounds reads badly as a fraction of a stone.
 */
export const formatWeightDelta = (kg: number, unit: string): string => {
  const inLbs = unit === 'lbs' || unit === 'st_lbs';
  const value = inLbs ? kgToLbs(kg) : kg;
  return `${formatSignedWeightChange(value)} ${inLbs ? 'lbs' : 'kg'}`;
};
