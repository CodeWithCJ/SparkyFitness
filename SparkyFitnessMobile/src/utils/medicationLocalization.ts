import type { TFunction } from 'i18next';

export function medicationTypeLabel(
  typeId: string | null | undefined,
  t: TFunction
): string {
  switch (typeId) {
    case 'pill':
      return t('medications.types.pill', { defaultValue: 'Pill' });
    case 'tablet':
      return t('medications.types.tablet', { defaultValue: 'Tablet' });
    case 'capsule':
      return t('medications.types.capsule', { defaultValue: 'Capsule' });
    case 'softgel':
      return t('medications.types.softgel', { defaultValue: 'Softgel' });
    case 'gummy':
      return t('medications.types.gummy', { defaultValue: 'Gummy' });
    case 'powder':
      return t('medications.types.powder', { defaultValue: 'Powder' });
    case 'liquid':
      return t('medications.types.liquid', { defaultValue: 'Liquid' });
    case 'injection':
      return t('medications.types.injection', { defaultValue: 'Injection' });
    case 'patch':
      return t('medications.types.patch', { defaultValue: 'Patch' });
    case 'inhaler':
      return t('medications.types.inhaler', { defaultValue: 'Inhaler' });
    case 'drops':
      return t('medications.types.drops', { defaultValue: 'Drops' });
    case 'nasal_spray':
      return t('medications.types.nasal_spray', {
        defaultValue: 'Nasal Spray',
      });
    case 'cream':
      return t('medications.types.cream', { defaultValue: 'Cream' });
    case 'suppository':
      return t('medications.types.suppository', {
        defaultValue: 'Suppository',
      });
    case 'other':
      return t('medications.types.other', { defaultValue: 'Other' });
    case 'daily':
      return t('medications.types.daily', { defaultValue: 'Daily' });
    case 'weekly':
      return t('medications.types.weekly', { defaultValue: 'Specific days' });
    case 'specific_days':
      return t('medications.types.weekly', { defaultValue: 'Specific days' });
    case 'every_n_days':
      return t('medications.types.every_n_days', {
        defaultValue: 'Every N days',
      });
    case 'monthly':
      return t('medications.types.monthly', { defaultValue: 'Monthly' });
    case 'cyclic':
      return t('medications.types.cyclic', { defaultValue: 'Cycle (on/off)' });
    case 'prn':
      return t('medications.types.prn', { defaultValue: 'As needed' });
    default:
      return typeId ?? '';
  }
}

export function scheduleTypeLabel(typeId: string, t: TFunction): string {
  return medicationTypeLabel(typeId, t);
}

export function mealTimingLabel(value: string, t: TFunction): string {
  switch (value) {
    case 'before':
      return t('medications.types.beforeMeal', { defaultValue: 'Before meal' });
    case 'with':
      return t('medications.types.withMeal', { defaultValue: 'With meal' });
    case 'after':
      return t('medications.types.afterMeal', { defaultValue: 'After meal' });
    default:
      return value;
  }
}

export function injectionSiteLabel(siteId: string, t: TFunction): string {
  switch (siteId) {
    case 'stomach_upper_left':
      return t('medications.glp1.sites.stomach_upper_left', {
        defaultValue: 'Stomach - Upper Left',
      });
    case 'stomach_upper_mid':
      return t('medications.glp1.sites.stomach_upper_mid', {
        defaultValue: 'Stomach - Upper Mid',
      });
    case 'stomach_upper_right':
      return t('medications.glp1.sites.stomach_upper_right', {
        defaultValue: 'Stomach - Upper Right',
      });
    case 'stomach_mid_left':
      return t('medications.glp1.sites.stomach_mid_left', {
        defaultValue: 'Stomach - Left Mid',
      });
    case 'stomach_mid_right':
      return t('medications.glp1.sites.stomach_mid_right', {
        defaultValue: 'Stomach - Right Mid',
      });
    case 'stomach_lower_left':
      return t('medications.glp1.sites.stomach_lower_left', {
        defaultValue: 'Stomach - Lower Left',
      });
    case 'stomach_lower_mid':
      return t('medications.glp1.sites.stomach_lower_mid', {
        defaultValue: 'Stomach - Lower Mid',
      });
    case 'stomach_lower_right':
      return t('medications.glp1.sites.stomach_lower_right', {
        defaultValue: 'Stomach - Lower Right',
      });
    case 'left_arm':
      return t('medications.glp1.sites.left_arm', {
        defaultValue: 'Left Arm',
      });
    case 'right_arm':
      return t('medications.glp1.sites.right_arm', {
        defaultValue: 'Right Arm',
      });
    case 'left_thigh':
      return t('medications.glp1.sites.left_thigh', {
        defaultValue: 'Left Thigh',
      });
    case 'right_thigh':
      return t('medications.glp1.sites.right_thigh', {
        defaultValue: 'Right Thigh',
      });
    case 'left_hip':
      return t('medications.glp1.sites.left_hip', {
        defaultValue: 'Left Hip',
      });
    case 'right_hip':
      return t('medications.glp1.sites.right_hip', {
        defaultValue: 'Right Hip',
      });
    case 'unknown':
      return t('medications.glp1.sites.unknown', {
        defaultValue: 'Unknown',
      });
    default:
      return siteId;
  }
}

export function glp1CheckInMetricLabel(
  metricKey: 'hunger' | 'food_noise' | 'fullness' | 'energy',
  t: TFunction
): string {
  switch (metricKey) {
    case 'hunger':
      return t('medications.glp1.checkIn.metric.hunger', {
        defaultValue: 'Hunger',
      });
    case 'food_noise':
      return t('medications.glp1.checkIn.metric.food_noise', {
        defaultValue: 'Food noise',
      });
    case 'fullness':
      return t('medications.glp1.checkIn.metric.fullness', {
        defaultValue: 'Fullness',
      });
    case 'energy':
      return t('medications.glp1.checkIn.metric.energy', {
        defaultValue: 'Energy',
      });
  }
}
