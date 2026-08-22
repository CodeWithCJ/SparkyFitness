import type { TFunction } from 'i18next';

export function medicationTypeLabel(typeId: string | null | undefined, t: TFunction): string {
  switch (typeId) {
    case 'pill': return t('medications.types.pill', { defaultValue: 'Pill' });
    case 'tablet': return t('medications.types.tablet', { defaultValue: 'Tablet' });
    case 'capsule': return t('medications.types.capsule', { defaultValue: 'Capsule' });
    case 'liquid': return t('medications.types.liquid', { defaultValue: 'Liquid' });
    case 'injection': return t('medications.types.injection', { defaultValue: 'Injection' });
    case 'patch': return t('medications.types.patch', { defaultValue: 'Patch' });
    case 'inhaler': return t('medications.types.inhaler', { defaultValue: 'Inhaler' });
    case 'drops': return t('medications.types.drops', { defaultValue: 'Drops' });
    case 'nasal_spray': return t('medications.types.nasal_spray', { defaultValue: 'Nasal Spray' });
    case 'cream': return t('medications.types.cream', { defaultValue: 'Cream' });
    case 'suppository': return t('medications.types.suppository', { defaultValue: 'Suppository' });
    case 'other': return t('medications.types.other', { defaultValue: 'Other' });
    case 'daily': return t('medications.types.daily', { defaultValue: 'Daily' });
    case 'weekly': return t('medications.types.weekly', { defaultValue: 'Specific days' });
    case 'specific_days': return t('medications.types.weekly', { defaultValue: 'Specific days' });
    case 'every_n_days': return t('medications.types.every_n_days', { defaultValue: 'Every N days' });
    case 'monthly': return t('medications.types.monthly', { defaultValue: 'Monthly' });
    case 'cyclic': return t('medications.types.cyclic', { defaultValue: 'Cycle (on/off)' });
    case 'prn': return t('medications.types.prn', { defaultValue: 'As needed' });
    default: return typeId ?? '';
  }
}

export function scheduleTypeLabel(typeId: string, t: TFunction): string {
  return medicationTypeLabel(typeId, t);
}

export function mealTimingLabel(value: string, t: TFunction): string {
  switch (value) {
    case 'before': return t('medications.types.beforeMeal', { defaultValue: 'Before meal' });
    case 'with': return t('medications.types.withMeal', { defaultValue: 'With meal' });
    case 'after': return t('medications.types.afterMeal', { defaultValue: 'After meal' });
    default: return value;
  }
}
