import type { TFunction } from 'i18next';
import type { OralCareSessionResponse, OralCareType } from '@workspace/shared';

/** The type's name in the app language. */
export function oralCareTypeLabel(type: OralCareType, t: TFunction): string {
  switch (type) {
    case 'brushing':
      return t('oralCare.types.brushing', { defaultValue: 'Brushing' });
    case 'flossing':
      return t('oralCare.types.flossing', { defaultValue: 'Flossing' });
    case 'mouthwash':
      return t('oralCare.types.mouthwash', { defaultValue: 'Mouthwash' });
    case 'tongue_cleaning':
      return t('oralCare.types.tongueCleaning', {
        defaultValue: 'Tongue cleaning',
      });
    case 'other':
      return t('oralCare.types.other', { defaultValue: 'Other' });
  }
}

/** A session's name: its own name for "other", else the type's. */
export function oralCareSessionLabel(
  session: Pick<OralCareSessionResponse, 'care_type' | 'custom_label'>,
  t: TFunction
): string {
  return session.care_type === 'other' && session.custom_label
    ? session.custom_label
    : oralCareTypeLabel(session.care_type, t);
}

/** m:ss, for durations up to an hour. */
export function formatOralCareClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
