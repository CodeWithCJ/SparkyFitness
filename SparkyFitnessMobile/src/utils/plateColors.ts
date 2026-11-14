import type { PlateUnit } from '@workspace/shared';

export type PlateColorKey =
  'red' | 'blue' | 'yellow' | 'green' | 'white' | 'grey';

/** Competition plate colours; only exact weights match, everything else is grey. */
const STANDARD_COLORS: Record<PlateUnit, Record<number, PlateColorKey>> = {
  kg: { 25: 'red', 20: 'blue', 15: 'yellow', 10: 'green', 5: 'white' },
  lbs: { 55: 'red', 45: 'blue', 35: 'yellow', 25: 'green', 10: 'white' },
};

/** The heaviest standard plate per unit: it is drawn at full height. */
const REFERENCE_WEIGHT: Record<PlateUnit, number> = { kg: 25, lbs: 55 };

/** Plates with these colours take the dark label ink. */
const LIGHT_PLATES: readonly PlateColorKey[] = [
  'yellow',
  'green',
  'white',
  'grey',
];

export const plateColorKey = (weight: number, unit: PlateUnit): PlateColorKey =>
  STANDARD_COLORS[unit][weight] ?? 'grey';

export const plateUsesDarkLabel = (key: PlateColorKey): boolean =>
  LIGHT_PLATES.includes(key);

/** The legend order on the calculator: heaviest to lightest standard plate. */
export const standardPlateWeights = (unit: PlateUnit): number[] =>
  Object.keys(STANDARD_COLORS[unit])
    .map(Number)
    .sort((a, b) => b - a);

/**
 * A plate's height and thickness in bar-drawing units (a 140 unit tall
 * canvas): the heaviest standard plate is 120 tall and 22 thick, lighter ones
 * shrink on a soft curve so a 1.25 kg disc is still visible.
 */
export function plateDimensions(
  weight: number,
  unit: PlateUnit
): { height: number; width: number } {
  const ratio = Math.min(1, Math.max(0, weight / REFERENCE_WEIGHT[unit]));
  return {
    height: 30 + 90 * ratio ** 0.45,
    width: 8 + 14 * Math.sqrt(ratio),
  };
}
