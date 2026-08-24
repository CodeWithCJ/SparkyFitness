import type { TFunction } from 'i18next';
import type { SafetyStatus } from '@workspace/shared';

export function localizeSafetyStatus(t: TFunction, status: SafetyStatus): string {
  switch (status) {
    case 'safe': return t('pregnancySafety.safe', { defaultValue: 'Safe' });
    case 'caution': return t('pregnancySafety.caution', { defaultValue: 'Caution' });
    case 'avoid': return t('pregnancySafety.avoid', { defaultValue: 'Avoid' });
  }
}
