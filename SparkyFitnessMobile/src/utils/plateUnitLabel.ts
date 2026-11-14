import type { TFunction } from 'i18next';
import type { PlateUnit } from '@workspace/shared';

/** The unit as the plate screens write it: "kg" and "lb" (never "lbs"). */
export const plateUnitLabel = (t: TFunction, unit: PlateUnit): string =>
  unit === 'kg'
    ? t('plates.unitKg', { defaultValue: 'kg' })
    : t('plates.unitLb', { defaultValue: 'lb' });
