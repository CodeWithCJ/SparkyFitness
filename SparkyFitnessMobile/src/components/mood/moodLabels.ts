import type { TFunction } from 'i18next';

/** Localized labels for the built-in moods, keyed by their shared slug. */
export const getBuiltInMoodLabels = (t: TFunction): Record<string, string> => ({
  sad: t('mood.names.sad', { defaultValue: 'Sad' }),
  angry: t('mood.names.angry', { defaultValue: 'Angry' }),
  worried: t('mood.names.worried', { defaultValue: 'Worried' }),
  neutral: t('mood.names.neutral', { defaultValue: 'Neutral' }),
  thoughtful: t('mood.names.thoughtful', { defaultValue: 'Thoughtful' }),
  calm: t('mood.names.calm', { defaultValue: 'Calm' }),
  confident: t('mood.names.confident', { defaultValue: 'Confident' }),
  happy: t('mood.names.happy', { defaultValue: 'Happy' }),
  excited: t('mood.names.excited', { defaultValue: 'Excited' }),
  energetic: t('mood.names.energetic', { defaultValue: 'Energetic' }),
  sensitive: t('mood.names.sensitive', { defaultValue: 'Sensitive' }),
  tired: t('mood.names.tired', { defaultValue: 'Tired' }),
  low: t('mood.names.low', { defaultValue: 'Low energy' }),
  anxious: t('mood.names.anxious', { defaultValue: 'Anxious' }),
  irritable: t('mood.names.irritable', { defaultValue: 'Irritable' }),
});
