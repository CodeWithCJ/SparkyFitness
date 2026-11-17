import { normalizeEnergyUnit, type EnergyUnit } from '@workspace/shared';
import { usePreferences } from './usePreferences';

/** The unit the account shows energy in (stored values are always kcal). */
export function useEnergyUnit(): EnergyUnit {
  const { preferences } = usePreferences();
  return normalizeEnergyUnit(preferences?.energy_unit);
}
