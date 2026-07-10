import type { TFunction } from 'i18next';

const STANDARD_UNIT_KEYS: Readonly<Record<string, string>> = {
  g: 'units.gram',
  mg: 'units.milligram',
  µg: 'units.microgram',
  μg: 'units.microgram',
  mcg: 'units.microgram',
  kg: 'units.kilogram',
  ml: 'units.milliliter',
  l: 'units.liter',
  liter: 'units.liter',
  litre: 'units.liter',
  oz: 'units.fluidOunce',
  'fl oz': 'units.fluidOunce',
  kcal: 'units.kcal',
  kj: 'units.kJ',
  min: 'units.minuteShort',
  minute: 'units.minuteShort',
  minutes: 'units.minuteShort',
  cm: 'units.centimeter',
  km: 'units.kilometer',
  lb: 'units.pound',
  lbs: 'units.pound',
  in: 'units.inch',
  inch: 'units.inch',
  inches: 'units.inch',
  '%': 'units.percent',
};

export const getLocalizedUnitLabel = (unit: string, t: TFunction): string => {
  const trimmedUnit = unit.trim();
  const translationKey = STANDARD_UNIT_KEYS[trimmedUnit.toLowerCase()];

  return translationKey ? t(translationKey) : trimmedUnit;
};
