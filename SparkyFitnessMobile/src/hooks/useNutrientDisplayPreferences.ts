import { useQuery } from '@tanstack/react-query';
import {
  fetchNutrientDisplayPreferences,
  type NutrientDisplayPreference,
} from '../services/api/preferencesApi';
import { nutrientDisplayPreferencesQueryKey } from './queryKeys';
import { DEFAULT_SUMMARY_NUTRIENTS } from '../constants/nutrients';

export type { NutrientDisplayPreference };

interface UseNutrientDisplayPreferencesOptions {
  enabled?: boolean;
}

/**
 * Fetches the user's nutrient display preferences for all view groups.
 *
 * Exposes a `summaryNutrients` convenience selector that returns the ordered
 * list of nutrient keys for the `summary / mobile` view group — ready for
 * use in the Dashboard macro grid.
 *
 * Falls back to DEFAULT_SUMMARY_NUTRIENTS when no preference row exists for
 * the user (i.e. they've never customised the setting), which matches the
 * server-side defaultNutrients list.
 */
export function useNutrientDisplayPreferences({
  enabled = true,
}: UseNutrientDisplayPreferencesOptions = {}) {
  const query = useQuery({
    queryKey: nutrientDisplayPreferencesQueryKey,
    queryFn: fetchNutrientDisplayPreferences,
    staleTime: 1000 * 60 * 30, // 30 minutes
    enabled,
  });

  const preferences = query.data ?? [];

  const summaryPref = preferences.find(
    (p) => p.view_group === 'summary' && p.platform === 'mobile',
  );

  // Exclude 'calories' from the macro grid — it's already shown in CalorieRingCard.
  const summaryNutrients: string[] = summaryPref
    ? summaryPref.visible_nutrients.filter((n) => n !== 'calories')
    : [...DEFAULT_SUMMARY_NUTRIENTS];

  return {
    preferences,
    summaryNutrients,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
