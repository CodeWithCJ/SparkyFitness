import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { FoodEntry } from '@/types/food';
import type { GroupedExerciseEntry } from '@/api/Exercises/exerciseEntryService';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { dailyProgressKeys, foodEntryKeys } from '@/api/keys/diary';
import {
  calculateFoodEntryNutrition,
  convertStepsToCalories,
} from '@/utils/nutritionCalculations';
import {
  getCheckInMeasurementsForDate,
  getExerciseEntriesForDate,
  getFoodEntriesForDate,
  getGoalsForDate,
} from '@/api/Diary/dailyProgressService';
import { userManagementService } from '@/api/Admin/userManagementService';
import { getMostRecentMeasurement } from '@/api/CheckIn/checkInService';
import { calculateBmr } from '@/services/bmrService';

export const useDailyGoals = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: dailyProgressKeys.goals(date),
    queryFn: () => getGoalsForDate(date),
    enabled: !!date,
    meta: {
      errorMessage: t(
        'dailyProgress.goalsLoadError',
        'Failed to load daily goals.'
      ),
    },
  });
};

export const useDailyFoodIntake = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: foodEntryKeys.byDate(date),
    queryFn: () => getFoodEntriesForDate(date),
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
  const isToday = date === new Date().toLocaleDateString('en-CA');
  return useQuery({
    queryKey: dailyProgressKeys.exercises(date),
    queryFn: () => getExerciseEntriesForDate(date),
    enabled: !!date,
    refetchInterval: isToday ? 5 * 60 * 1000 : false,
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
  const isToday = date === new Date().toLocaleDateString('en-CA');
  return useQuery({
    queryKey: dailyProgressKeys.steps(date),
    queryFn: () => getCheckInMeasurementsForDate(date),
    enabled: !!date,
    refetchInterval: isToday ? 5 * 60 * 1000 : false,
    select: (data) => {
      const steps = data?.steps || 0;
      return {
        steps,
        calories: convertStepsToCalories(Number(steps)),
      };
    },
  });
};

export const useCalculatedBMR = () => {
  const { user } = useAuth();
  const { bmrAlgorithm, includeBmrInNetCalories } = usePreferences();

  const { data: userProfile } = useQuery({
    queryKey: ['user', 'profile', user?.id],
    queryFn: () => userManagementService.getUserProfile(user!.id),
    enabled: !!user?.id,
  });

  const { data: weightData } = useQuery({
    queryKey: dailyProgressKeys.measurements.mostRecent('weight'),
    queryFn: () => getMostRecentMeasurement('weight'),
  });

  const { data: heightData } = useQuery({
    queryKey: dailyProgressKeys.measurements.mostRecent('height'),
    queryFn: () => getMostRecentMeasurement('height'),
  });

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
    return { bmr: null, includeInNet: false };
  }

  const age = userProfile.date_of_birth
    ? new Date().getFullYear() -
      new Date(userProfile.date_of_birth).getFullYear()
    : 0;

  try {
    const bmr = calculateBmr(
      bmrAlgorithm,
      weightData.weight,
      heightData.height,
      age,
      userProfile.gender,
      bodyFatData?.body_fat_percentage
    );

    return {
      bmr,
      includeInNet: includeBmrInNetCalories || false,
    };
  } catch (err) {
    return { bmr: null, includeInNet: false };
  }
};
