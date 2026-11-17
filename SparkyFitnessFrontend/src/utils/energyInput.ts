import {
  energyFromKcal,
  energyToKcal,
  type EnergyUnit,
} from '@workspace/shared';

/**
 * An energy field's value (kept in kcal by the form) as shown in the account's
 * unit: kcal exactly as stored, kJ as a whole number.
 */
export const shownEnergyInput = (
  kcal: number | '' | null | undefined,
  unit: EnergyUnit
): number | '' => {
  if (kcal === '' || kcal == null) return '';
  return unit === 'kcal'
    ? Number(kcal)
    : Math.round(energyFromKcal(Number(kcal), unit));
};

/**
 * A value typed in the account's unit back to kcal for the form. Not rounded,
 * so the field shows what was typed and an untouched value is never altered.
 */
export const kcalFromEnergyInput = (
  value: number | '',
  unit: EnergyUnit
): number | '' => {
  if (value === '') return '';
  return unit === 'kcal' ? value : energyToKcal(Number(value), unit);
};
