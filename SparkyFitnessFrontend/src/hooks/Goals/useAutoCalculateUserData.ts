import { useAuth } from '@/hooks/useAuth';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import { useMostRecentWeightQuery } from '@/hooks/Diary/useDailyProgress';
import { usePreferences } from '@/contexts/PreferencesContext';
import { calculateAge } from '@workspace/shared';
import type { UserNutrientData } from '@/services/nutrientCalculationService';

// PreferencesContext's ActivityLevel includes 'none', which UserNutrientData
// doesn't model (each calculate* function just falls back to its own default
// when activityLevel is undefined).
function toUserNutrientActivityLevel(
  level: string
): UserNutrientData['activityLevel'] {
  if (
    level === 'not_much' ||
    level === 'light' ||
    level === 'moderate' ||
    level === 'heavy'
  ) {
    return level;
  }
  return undefined;
}

/**
 * Builds the shared input object for the per-nutrient Auto-calculate feature
 * (see NutrientAutoCalculate.tsx) from the user's profile, most recent
 * weight, and activity-level preference — the same inputs onboarding
 * gathers once at signup, made available anywhere a goal is edited later.
 * `calories`/`totalFatGrams` come from the caller's own in-progress goal
 * state, since those vary per surface (today's goal, a preset, etc).
 *
 * Returns null when sex is unknown, since several formulas are sex-based and
 * guessing would produce a silently wrong recommendation.
 */
export function useAutoCalculateUserData(
  calories: number,
  totalFatGrams: number
): UserNutrientData | null {
  const { user } = useAuth();
  const { data: userProfile } = useProfileQuery(user?.id);
  const { data: weightData } = useMostRecentWeightQuery();
  const { timezone, activityLevel } = usePreferences();

  const sex: 'male' | 'female' | undefined =
    userProfile?.gender?.toLowerCase() === 'male'
      ? 'male'
      : userProfile?.gender?.toLowerCase() === 'female'
        ? 'female'
        : undefined;

  if (!sex) return null;

  const age = userProfile?.date_of_birth
    ? calculateAge(userProfile.date_of_birth, timezone)
    : 0;

  return {
    age,
    sex,
    weightKg: weightData?.weight ?? 0,
    calories,
    totalFatGrams,
    activityLevel: toUserNutrientActivityLevel(activityLevel),
  };
}
