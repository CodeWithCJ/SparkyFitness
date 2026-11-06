import { isTemperatureUnit, type TemperatureUnit } from '@workspace/shared';
import type { UserPreferences } from '../types/preferences';

/**
 * The unit temperatures are shown in: the account's `default_temperature_unit`.
 * A server from before that setting does not send it, so the old rule applies
 * there: °F with the miles distance setting, otherwise °C.
 */
export const temperatureUnitFor = (
  preferences:
    | Pick<
        UserPreferences,
        'default_temperature_unit' | 'default_distance_unit'
      >
    | null
    | undefined
): TemperatureUnit => {
  if (isTemperatureUnit(preferences?.default_temperature_unit)) {
    return preferences.default_temperature_unit;
  }
  return preferences?.default_distance_unit === 'miles'
    ? 'fahrenheit'
    : 'celsius';
};
