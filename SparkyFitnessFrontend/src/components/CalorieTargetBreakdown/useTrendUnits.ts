import { usePreferences } from '@/contexts/PreferencesContext';
import { CONVERSION_FACTORS, kgToLbs } from '@/utils/unitConversions';
import {
  ENERGY_DENSITY_KCAL_PER_KG,
  FAT_KCAL_PER_KG,
  LEAN_TISSUE_KCAL_PER_KG,
} from '@workspace/shared';

export const useTrendUnits = () => {
  const { weightUnit = 'kg' } = usePreferences();

  // Adaptive TDEE stores mass in kg. Convert the shown working to the
  // configured unit so the trend matches every other weight display. Stones
  // rates use pounds: a per-stone energy density is not a useful working figure.
  const trendMassUnit: 'kg' | 'lbs' =
    weightUnit === 'lbs' || weightUnit === 'st_lbs' ? 'lbs' : 'kg';
  const trendMassUnitName = trendMassUnit === 'lbs' ? 'pound' : 'kilogram';
  const kcalPerTrendUnit =
    trendMassUnit === 'lbs'
      ? Math.round(ENERGY_DENSITY_KCAL_PER_KG * CONVERSION_FACTORS.LBS_TO_KG)
      : ENERGY_DENSITY_KCAL_PER_KG;
  const fatPerTrendUnit =
    trendMassUnit === 'lbs'
      ? Math.round(FAT_KCAL_PER_KG * CONVERSION_FACTORS.LBS_TO_KG)
      : FAT_KCAL_PER_KG;
  const leanPerTrendUnit =
    trendMassUnit === 'lbs'
      ? Math.round(LEAN_TISSUE_KCAL_PER_KG * CONVERSION_FACTORS.LBS_TO_KG)
      : LEAN_TISSUE_KCAL_PER_KG;
  const toTrendMass = (kg: number) =>
    trendMassUnit === 'lbs' ? kgToLbs(kg) : kg;

  return {
    trendMassUnit,
    trendMassUnitName,
    kcalPerTrendUnit,
    fatPerTrendUnit,
    leanPerTrendUnit,
    toTrendMass,
  };
};
