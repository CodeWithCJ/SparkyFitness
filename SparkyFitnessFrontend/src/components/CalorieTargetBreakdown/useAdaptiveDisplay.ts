import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import type { AdaptiveTdeeData } from './types';

export const useAdaptiveDisplay = (
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined
) => {
  const { energyUnit, convertEnergy } = usePreferences();

  // Adaptive TDEE derivation, in the units actually shown. The server reconciles
  // its figures in kcal, but converting and rounding each one independently breaks
  // the sum again in kJ — 2100 + 100 kcal renders as 8786 + 418 = 9204 kJ beside a
  // total of 9205. So the delta is derived from the two displayed numbers rather
  // than converted on its own, and the arithmetic holds in either unit.
  const displayAdaptiveIntake = Math.round(
    convertEnergy(adaptiveTdeeData?.avgIntake || 0, 'kcal', energyUnit)
  );
  const displayAdaptiveRawTdee = Math.round(
    convertEnergy(adaptiveTdeeData?.rawTdee || 0, 'kcal', energyUnit)
  );
  // Against the raw estimate, not the capped one: when the cap binds the total no
  // longer equals intake plus trend, and the trend row still has to state the real
  // trend rather than be bent to match a capped total.
  const displayAdaptiveDelta = displayAdaptiveRawTdee - displayAdaptiveIntake;
  // In kcal the equation stands alone; in any other unit the kcal result is shown
  // first (so the multiplication checks out) with the converted value beside it.
  const adaptiveDeltaKcal =
    Math.round(adaptiveTdeeData?.rawTdee || 0) -
    Math.round(adaptiveTdeeData?.avgIntake || 0);
  const signedKcal = `${adaptiveDeltaKcal >= 0 ? '+' : '−'}${Math.abs(
    adaptiveDeltaKcal
  )} kcal`;
  const adaptiveDeltaText =
    energyUnit === 'kcal'
      ? signedKcal
      : `${signedKcal} (${
          displayAdaptiveDelta >= 0 ? '+' : '−'
        }${Math.abs(displayAdaptiveDelta)} ${getEnergyUnitString(energyUnit)})`;

  return {
    displayAdaptiveIntake,
    displayAdaptiveRawTdee,
    displayAdaptiveDelta,
    adaptiveDeltaText,
  };
};
