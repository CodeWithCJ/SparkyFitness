import i18n from '../localization/i18n';

export function medicationTypeLabel(typeId: string | null | undefined): string {
  switch (typeId) {
    case 'pill': return i18n.t('medications.types.pill', { defaultValue: 'Pill' });
    case 'tablet': return i18n.t('medications.types.tablet', { defaultValue: 'Tablet' });
    case 'capsule': return i18n.t('medications.types.capsule', { defaultValue: 'Capsule' });
    case 'liquid': return i18n.t('medications.types.liquid', { defaultValue: 'Liquid' });
    case 'injection': return i18n.t('medications.types.injection', { defaultValue: 'Injection' });
    case 'patch': return i18n.t('medications.types.patch', { defaultValue: 'Patch' });
    case 'inhaler': return i18n.t('medications.types.inhaler', { defaultValue: 'Inhaler' });
    case 'drops': return i18n.t('medications.types.drops', { defaultValue: 'Drops' });
    case 'nasal_spray': return i18n.t('medications.types.nasal_spray', { defaultValue: 'Nasal Spray' });
    case 'cream': return i18n.t('medications.types.cream', { defaultValue: 'Cream' });
    case 'suppository': return i18n.t('medications.types.suppository', { defaultValue: 'Suppository' });
    case 'other': return i18n.t('medications.types.other', { defaultValue: 'Other' });
    case 'daily': return i18n.t('medications.types.daily', { defaultValue: 'Daily' });
    case 'weekly': return i18n.t('medications.types.weekly', { defaultValue: 'Specific days' });
    case 'every_n_days': return i18n.t('medications.types.every_n_days', { defaultValue: 'Every N days' });
    case 'monthly': return i18n.t('medications.types.monthly', { defaultValue: 'Monthly' });
    case 'cyclic': return i18n.t('medications.types.cyclic', { defaultValue: 'Cycle (on/off)' });
    case 'prn': return i18n.t('medications.types.prn', { defaultValue: 'As needed' });
    default: return typeId ?? '';
  }
}

export function scheduleTypeLabel(typeId: string): string {
  return medicationTypeLabel(typeId);
}

export function mealTimingLabel(value: string): string {
  switch (value) {
    case 'before': return i18n.t('medications.types.beforeMeal', { defaultValue: 'Before meal' });
    case 'with': return i18n.t('medications.types.withMeal', { defaultValue: 'With meal' });
    case 'after': return i18n.t('medications.types.afterMeal', { defaultValue: 'After meal' });
    default: return value;
  }
}
