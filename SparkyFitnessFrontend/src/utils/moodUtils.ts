// SparkyFitnessFrontend/src/utils/moodUtils.ts

import { moodByName, moodValueToTag } from '@workspace/shared';

import i18n from 'i18next';
/** What a day with no mood logged shows. */
const NO_MOOD = {
  emoji: '😐',
  get label() {
    return i18n.t('moodUtils.neutral', 'Neutral');
  },
} as const;

/**
 * The emoji and label a stored `mood_value` stands for.
 *
 * Reads the shared band model, the same one the check-in page and the server
 * use. This used to carry its own copy of the bands, cut at 10/20/30/... where
 * the shared ones are cut at 15/25/35/..., so every value from 10 to 90 was
 * labelled one band off: a day logged as "Confident" came back as "Calm" here.
 */
export const getMoodDisplay = (
  moodValue: number | null
): { emoji: string; label: string } => {
  if (moodValue === null) return { ...NO_MOOD };
  const def = moodByName(moodValueToTag(moodValue));
  return def ? { emoji: def.emoji, label: def.displayName } : { ...NO_MOOD };
};
