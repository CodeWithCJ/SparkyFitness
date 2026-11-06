import type { TemperatureUnit } from '@workspace/shared';
import { temperatureUnitFor } from '../utils/temperatureUnit';
import { usePreferences } from './usePreferences';

/** The unit the account shows temperatures in (stored values are always °C). */
export function useTemperatureUnit(): TemperatureUnit {
  const { preferences } = usePreferences();
  return temperatureUnitFor(preferences);
}
