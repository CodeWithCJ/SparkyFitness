export type TemperatureUnit = 'celsius' | 'fahrenheit';

/**
 * The app has no temperature setting of its own: temperatures follow the distance
 * setting, °F with miles and °C with kilometres, the same way elevation is shown
 * in feet with miles.
 */
export const temperatureUnitFor = (
  distanceUnit: string | null | undefined
): TemperatureUnit => (distanceUnit === 'miles' ? 'fahrenheit' : 'celsius');

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
