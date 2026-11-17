import type { TFunction } from 'i18next';
import {
  energyFromKcal,
  energyToKcal,
  type EnergyUnit,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import { parseDecimalInput } from './numericInput';

/** The translated label for an energy unit ("kcal" or "kJ"). */
export const energyUnitLabel = (unit: EnergyUnit, t: TFunction): string =>
  unit === 'kJ'
    ? t('common.kJUnit', { defaultValue: 'kJ' })
    : t('common.kcalUnit', { defaultValue: 'kcal' });

/** A kcal value in the given unit, rounded for display (whole numbers by default). */
export const roundedEnergy = (
  kcal: number,
  unit: EnergyUnit,
  decimals = 0
): number => {
  const factor = 10 ** decimals;
  return Math.round(energyFromKcal(kcal, unit) * factor) / factor;
};

/** A kcal value in the given unit as a localized number, without the unit label. */
export const formatEnergyNumber = (
  kcal: number,
  unit: EnergyUnit,
  decimals = 0
): string =>
  formatLocalizedNumber(roundedEnergy(kcal, unit, decimals), {
    maximumFractionDigits: decimals,
  });

/** A kcal value in the given unit with its label, e.g. "1,250 kJ". */
export const formatEnergy = (
  kcal: number,
  unit: EnergyUnit,
  t: TFunction,
  decimals = 0
): string =>
  `${formatEnergyNumber(kcal, unit, decimals)} ${energyUnitLabel(unit, t)}`;

/**
 * An energy input's stored kcal text as the text shown in the account's unit.
 * kcal passes through untouched; text that is not a number is left as it is.
 */
export const kcalTextToDisplayText = (
  kcalText: string,
  unit: EnergyUnit
): string => {
  if (unit === 'kcal' || kcalText.trim() === '') return kcalText;
  const kcal = parseDecimalInput(kcalText);
  if (!Number.isFinite(kcal)) return kcalText;
  const value = energyFromKcal(kcal, unit);
  return String(
    Math.abs(value) >= 1 ? Math.round(value) : Number(value.toFixed(2))
  );
};

/**
 * Text typed in the account's unit as kcal text for the form and the server.
 * Kept to four decimals so a kJ value survives the trip to kcal and back.
 */
export const displayTextToKcalText = (
  text: string,
  unit: EnergyUnit
): string => {
  if (unit === 'kcal' || text.trim() === '') return text;
  const value = parseDecimalInput(text);
  if (!Number.isFinite(value)) return text;
  return String(Number(energyToKcal(value, unit).toFixed(4)));
};
