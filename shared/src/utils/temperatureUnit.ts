/** Units a person can see temperatures in. Stored temperatures are always °C. */
export const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'] as const;

export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

export const DEFAULT_TEMPERATURE_UNIT: TemperatureUnit = 'celsius';

export const isTemperatureUnit = (value: unknown): value is TemperatureUnit =>
  typeof value === 'string' &&
  (TEMPERATURE_UNITS as readonly string[]).includes(value);

/** A temperature stored in °C, in the given unit. */
export const convertTemperature = (
  celsius: number,
  unit: TemperatureUnit
): number => (unit === 'fahrenheit' ? celsius * 1.8 + 32 : celsius);

/** A temperature difference stored in °C, in the given unit (no 32° offset). */
export const convertTemperatureDelta = (
  celsius: number,
  unit: TemperatureUnit
): number => (unit === 'fahrenheit' ? celsius * 1.8 : celsius);
