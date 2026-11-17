import { useMemo } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCustomNutrients } from './useCustomNutrients';
import { DEFAULT_NUTRIENTS } from '@/constants/nutrients';
import { visibleCustomNutrients } from '@/utils/nutrientUtils';

/** Shared presentation preferences for food-search and recipe-search cards. */
export function useFoodResultNutrientConfig() {
  const {
    nutrientDisplayPreferences = [],
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
  } = usePreferences();
  const platform = useIsMobile() ? 'mobile' : 'desktop';
  const { data: customNutrients } = useCustomNutrients();
  const preferences = (group: string) =>
    nutrientDisplayPreferences.find(
      (p) => p.view_group === group && p.platform === platform
    ) ??
    nutrientDisplayPreferences.find(
      (p) => p.view_group === group && p.platform === 'desktop'
    );
  const quick = preferences('quick_info');
  const database = preferences('food_database');
  const visibleNutrients = useMemo(
    () =>
      Array.from(
        new Set([
          ...(quick?.visible_nutrients ?? DEFAULT_NUTRIENTS),
          ...visibleCustomNutrients(customNutrients, database).map(
            (nutrient) => nutrient.name
          ),
        ])
      ),
    [quick, database, customNutrients]
  );
  return {
    visibleNutrients,
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    customNutrients: customNutrients ?? [],
  };
}
