/** Units a person can see energy in. Stored energy is always kcal. */
export const ENERGY_UNITS = ['kcal', 'kJ'] as const;

export type EnergyUnit = (typeof ENERGY_UNITS)[number];

export const DEFAULT_ENERGY_UNIT: EnergyUnit = 'kcal';

export const KJ_PER_KCAL = 4.184;

export const isEnergyUnit = (value: unknown): value is EnergyUnit =>
  typeof value === 'string' &&
  (ENERGY_UNITS as readonly string[]).includes(value);

/** The stored `energy_unit` preference as a known unit; anything else is kcal. */
export const normalizeEnergyUnit = (value: unknown): EnergyUnit =>
  isEnergyUnit(value) ? value : DEFAULT_ENERGY_UNIT;

/** Energy stored in kcal, in the given unit. */
export const energyFromKcal = (kcal: number, unit: EnergyUnit): number =>
  unit === 'kJ' ? kcal * KJ_PER_KCAL : kcal;

/** Energy entered in the given unit, as kcal for storage. */
export const energyToKcal = (value: number, unit: EnergyUnit): number =>
  unit === 'kJ' ? value / KJ_PER_KCAL : value;
