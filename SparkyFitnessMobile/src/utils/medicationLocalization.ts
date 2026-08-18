import i18n from '../localization/i18n';

const TYPE_DEFAULTS: Record<string, string> = {
  daily: i18n.t('medications.types.daily', { defaultValue: 'Daily' }),
  weekly: i18n.t('medications.types.weekly', { defaultValue: 'Specific days' }),
  every_n_days: i18n.t('medications.types.every_n_days', { defaultValue: 'Every N days' }),
  monthly: i18n.t('medications.types.monthly', { defaultValue: 'Monthly' }),
  cyclic: i18n.t('medications.types.cyclic', { defaultValue: 'Cycle (on/off)' }),
  prn: i18n.t('medications.types.prn', { defaultValue: 'As needed' }),
  pill: i18n.t('medications.types.pill', { defaultValue: 'Pill' }),
  tablet: i18n.t('medications.types.tablet', { defaultValue: 'Tablet' }),
  capsule: i18n.t('medications.types.capsule', { defaultValue: 'Capsule' }),
  liquid: i18n.t('medications.types.liquid', { defaultValue: 'Liquid' }),
  injection: i18n.t('medications.types.injection', { defaultValue: 'Injection' }),
  patch: i18n.t('medications.types.patch', { defaultValue: 'Patch' }),
  inhaler: i18n.t('medications.types.inhaler', { defaultValue: 'Inhaler' }),
  drops: i18n.t('medications.types.drops', { defaultValue: 'Drops' }),
  nasal_spray: i18n.t('medications.types.nasal_spray', { defaultValue: 'Nasal Spray' }),
  cream: i18n.t('medications.types.cream', { defaultValue: 'Cream' }),
  suppository: i18n.t('medications.types.suppository', { defaultValue: 'Suppository' }),
  other: i18n.t('medications.types.other', { defaultValue: 'Other' }),
};

export function medicationTypeLabel(typeId: string | null | undefined): string {
  return TYPE_DEFAULTS[typeId ?? ''] ?? typeId ?? '';
}

export function scheduleTypeLabel(typeId: string): string {
  return TYPE_DEFAULTS[typeId] ?? typeId;
}

const MEAL_LABELS: Record<string, string> = {
  before: i18n.t('medications.types.beforeMeal', { defaultValue: 'Before meal' }),
  with: i18n.t('medications.types.withMeal', { defaultValue: 'With meal' }),
  after: i18n.t('medications.types.afterMeal', { defaultValue: 'After meal' }),
};

export function mealTimingLabel(value: string): string {
  return MEAL_LABELS[value] ?? value;
}
