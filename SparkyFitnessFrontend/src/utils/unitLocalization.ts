import type { TFunction } from 'i18next';

const STANDARD_UNIT_KEYS: Readonly<Record<string, string>> = {
  g: 'units.gram',
  mg: 'units.milligram',
  µg: 'units.microgram',
  μg: 'units.microgram',
  mcg: 'units.microgram',
  kg: 'units.kilogram',
  st: 'units.stone',
  stone: 'units.stone',
  stones: 'units.stone',
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
  mi: 'units.mile',
  mile: 'units.mile',
  miles: 'units.mile',
  lb: 'units.pound',
  lbs: 'units.pound',
  in: 'units.inch',
  inch: 'units.inch',
  inches: 'units.inch',
  ft: 'units.foot',
  foot: 'units.foot',
  feet: 'units.foot',
  step: 'units.step',
  steps: 'units.step',
  year: 'units.year',
  years: 'units.year',
  bpm: 'units.bpm',
  '%': 'units.percent',
};

export const getLocalizedUnitLabel = (unit: string, t: TFunction): string => {
  const trimmedUnit = unit.trim();
  const translationKey = STANDARD_UNIT_KEYS[trimmedUnit.toLowerCase()];

  return translationKey ? t(translationKey) : trimmedUnit;
};
