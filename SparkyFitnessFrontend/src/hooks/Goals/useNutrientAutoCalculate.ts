import { useCallback, useMemo, useState } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useNutrientGoalPreferences } from '@/hooks/Settings/useNutrientGoalPreferences';
import { useAutoCalculateUserData } from '@/hooks/Goals/useAutoCalculateUserData';
import { NUTRIENT_CONFIG } from '@/constants/goals';
import { isAutoCalculable } from '@/pages/Goals/nutrientAutoCalculateHelpers';
import {
  computeAutoCalculatedValue,
  type AlgorithmBundle,
} from '@/services/nutrientCalculationService';
import type { UserCustomNutrient } from '@/types/customNutrient';

const DEFAULT_STANDARD_IDS = NUTRIENT_CONFIG.filter(
  (f) => !['protein', 'carbs', 'fat'].includes(f.id)
).map((f) => f.id);

interface UseNutrientAutoCalculateArgs {
  // Current in-progress goal state — varies per surface (today's goal, a
  // preset draft, a preset being edited).
  calories: number;
  totalFatGrams: number;
  customNutrients?: UserCustomNutrient[];
  // Which nutrient keys to test for auto-calculate eligibility. Defaults to
  // every predefined nutrient (excluding protein/carbs/fat, which have no
  // formula) plus every custom nutrient. Pass an explicit list (e.g. the
  // page's currently visible nutrients) to narrow that.
  candidateKeys?: string[];
}

/**
 * Shared state + logic behind the Auto-calculate feature (calculator icon +
 * bulk "Auto-calculate Selected" toolbar) on every goal-editing surface:
 * DailyGoals, EditGoalsForToday, and GoalPresetDialog. Each surface has its
 * own goal-state shape (ExpandedGoals vs GoalPreset) and setter, so
 * `applySelected` takes a generic updater instead of owning the state itself.
 */
export function useNutrientAutoCalculate({
  calories,
  totalFatGrams,
  customNutrients,
  candidateKeys,
}: UseNutrientAutoCalculateArgs) {
  const {
    fatBreakdownAlgorithm,
    mineralCalculationAlgorithm,
    vitaminCalculationAlgorithm,
    sugarCalculationAlgorithm,
    addedSugarAlgorithm,
  } = usePreferences();
  const { data: goalTypePreferences = {} } = useNutrientGoalPreferences();
  const autoCalculateUserData = useAutoCalculateUserData(
    calories,
    totalFatGrams
  );

  const algorithms: AlgorithmBundle = useMemo(
    () => ({
      fatBreakdown: fatBreakdownAlgorithm,
      minerals: mineralCalculationAlgorithm,
      vitamins: vitaminCalculationAlgorithm,
      sugar: sugarCalculationAlgorithm,
      addedSugar: addedSugarAlgorithm,
    }),
    [
      fatBreakdownAlgorithm,
      mineralCalculationAlgorithm,
      vitaminCalculationAlgorithm,
      sugarCalculationAlgorithm,
      addedSugarAlgorithm,
    ]
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const keys = useMemo(
    () =>
      candidateKeys ?? [
        ...DEFAULT_STANDARD_IDS,
        ...(customNutrients ?? []).map((cn) => cn.name),
      ],
    [candidateKeys, customNutrients]
  );

  const eligibleIds = useMemo(
    () =>
      keys.filter((key) => {
        const isCustom = customNutrients?.some((cn) => cn.name === key);
        const goalType = isCustom
          ? (goalTypePreferences[key]?.goalType ?? 'minimum')
          : undefined;
        const customAliases = isCustom
          ? customNutrients?.find((cn) => cn.name === key)?.aliases
          : undefined;
        return isAutoCalculable(key, customAliases, goalType);
      }),
    [keys, customNutrients, goalTypePreferences]
  );

  const toggleSelected = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(
    () => setSelected(new Set(eligibleIds)),
    [eligibleIds]
  );
  const selectNone = useCallback(() => setSelected(new Set()), []);

  const applySelected = useCallback(
    (apply: (updates: Record<string, number>) => void) => {
      if (!autoCalculateUserData) return;
      const updates: Record<string, number> = {};
      selected.forEach((id) => {
        const isAddedSugarLike = customNutrients?.some((cn) => cn.name === id);
        const value = computeAutoCalculatedValue(
          id,
          autoCalculateUserData,
          algorithms,
          !!isAddedSugarLike
        );
        if (value !== null) updates[id] = Math.round(value);
      });
      apply(updates);
      setSelected(new Set());
    },
    [autoCalculateUserData, selected, customNutrients, algorithms]
  );

  return {
    algorithms,
    autoCalculateUserData,
    goalTypePreferences,
    eligibleIds,
    selected,
    toggleSelected,
    selectAll,
    selectNone,
    applySelected,
  };
}
