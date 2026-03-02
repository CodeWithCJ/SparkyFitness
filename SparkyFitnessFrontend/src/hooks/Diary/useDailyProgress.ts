import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FoodEntry } from '@/types/food';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { dailyProgressKeys, foodEntryKeys } from '@/api/keys/diary';
import {
  calculateFoodEntryNutrition,
  convertStepsToCalories,
} from '@/utils/nutritionCalculations';
import { getExerciseEntriesForDate } from '@/api/Exercises/exerciseEntryService';
import { userManagementService } from '@/api/Admin/userManagementService';
import {
  getMostRecentMeasurement,
  loadExistingCheckInMeasurements,
} from '@/api/CheckIn/checkInService';
import { adaptiveTdeeService } from '@/api/Settings/adaptiveTdeeService';
import { calculateBmr, BmrAlgorithm } from '@/services/bmrService';
import { GroupedExerciseEntry } from '@/types/exercises';
import { userKeys } from '@/api/keys/admin';
import { exerciseEntryKeys } from '@/api/keys/exercises';
import { loadFoodEntries } from '@/api/Diary/foodEntryService';

export const useAdaptiveTdee = (date: string) => {
  return useQuery({
    queryKey: dailyProgressKeys.adaptiveTdee(date),
    queryFn: () => adaptiveTdeeService.getAdaptiveTdee(date),
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};

export const useDailyFoodIntake = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: foodEntryKeys.foodIntake(date),
    queryFn: () => loadFoodEntries(date),
    enabled: !!date,
    select: (entries: FoodEntry[]) => {
      const totals = entries.reduce(
        (acc, entry) => {
          const nutrition = calculateFoodEntryNutrition(entry);
          acc.calories += nutrition.calories;
          acc.protein += nutrition.protein;
          acc.carbs += nutrition.carbs;
          acc.fat += nutrition.fat;
          acc.water_ml += nutrition.water_ml;
          return acc;
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0, water_ml: 0 }
      );

      return {
        entries,
        totals: {
          calories: Math.round(totals.calories),
          protein: Math.round(totals.protein),
          carbs: Math.round(totals.carbs),
          fat: Math.round(totals.fat),
          water_ml: Math.round(totals.water_ml),
        },
      };
    },
    meta: {
      errorMessage: t(
        'dailyProgress.foodLoadError',
        'Failed to load food entries.'
      ),
    },
  });
};

export const useDailyExerciseStats = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: exerciseEntryKeys.dailyStats(date),
    queryFn: () => getExerciseEntriesForDate(date),
    enabled: !!date,
    select: (data: GroupedExerciseEntry[]) => {
      let activeCalories = 0;
      let otherCalories = 0;

      data.forEach((groupedEntry) => {
        if (groupedEntry.type === 'preset' && groupedEntry.exercises) {
          groupedEntry.exercises.forEach((entry) => {
            if (entry.exercise_snapshot?.name === 'Active Calories') {
              activeCalories += Number(entry.calories_burned || 0);
            } else {
              otherCalories += Number(entry.calories_burned || 0);
            }
          });
        } else if (groupedEntry.type === 'individual') {
          if (groupedEntry.exercise_snapshot?.name === 'Active Calories') {
            activeCalories += Number(groupedEntry.calories_burned || 0);
          } else {
            otherCalories += Number(groupedEntry.calories_burned || 0);
          }
        }
      });

      return {
        entries: data,
        activeCalories,
        otherCalories,
      };
    },
    meta: {
      errorMessage: t(
        'dailyProgress.exerciseLoadError',
        'Failed to load exercise entries.'
      ),
    },
  });
};

export const useDailySteps = (date: string) => {
  return useQuery({
    queryKey: dailyProgressKeys.steps(date),
    queryFn: () => loadExistingCheckInMeasurements(date),
    enabled: !!date,
    select: (data) => {
      const steps = data?.steps || 0;
      return {
        steps,
        calories: convertStepsToCalories(Number(steps)),
      };
    },
  });
};
export const useMostRecentWeightQuery = (enabled = true) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: dailyProgressKeys.measurements.mostRecent('weight'),
    queryFn: () => getMostRecentMeasurement('weight'),
    enabled,
    meta: {
      errorMessage: t(
        'measurements.errorLoadingWeight',
        'Failed to load most recent weight.'
      ),
    },
  });
};

export const useMostRecentHeightQuery = (enabled = true) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: dailyProgressKeys.measurements.mostRecent('height'),
    queryFn: () => getMostRecentMeasurement('height'),
    enabled,
    meta: {
      errorMessage: t(
        'measurements.errorLoadingHeight',
        'Failed to load most recent height.'
      ),
    },
  });
};
export const useCalculatedBMR = () => {
  const { user } = useAuth();
  const { bmrAlgorithm, includeBmrInNetCalories } = usePreferences();

  const { data: userProfile } = useQuery({
    queryKey: userKeys.profile(user?.id),
    queryFn: () => userManagementService.getUserProfile(user!.id),
    enabled: !!user?.id,
  });

  const { data: weightData } = useMostRecentWeightQuery();
  const { data: heightData } = useMostRecentHeightQuery();
  const { data: bodyFatData } = useQuery({
    queryKey: dailyProgressKeys.measurements.mostRecent('body_fat_percentage'),
    queryFn: () => getMostRecentMeasurement('body_fat_percentage'),
  });

  if (
    !userProfile ||
    !weightData?.weight ||
    !heightData?.height ||
    !userProfile.gender
  ) {
    return { bmr: 0, includeInNet: false };
  }

  const age = userProfile.date_of_birth
    ? new Date().getFullYear() -
      new Date(userProfile.date_of_birth).getFullYear()
    : 0;

  try {
    const bmr = calculateBmr(
      bmrAlgorithm as BmrAlgorithm,
      weightData.weight,
      heightData.height,
      age,
      userProfile.gender as 'male' | 'female',
      bodyFatData?.body_fat_percentage
    );

    return {
      bmr,
      includeInNet: includeBmrInNetCalories || false,
    };
  } catch (err) {
    return { bmr: 0, includeInNet: false };
  }
};
