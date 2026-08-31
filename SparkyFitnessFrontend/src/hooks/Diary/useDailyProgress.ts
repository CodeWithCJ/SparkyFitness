import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { calculateAge } from '@workspace/shared';
import { dailyProgressKeys } from '@/api/keys/diary';
import { userManagementService } from '@/api/Admin/userManagementService';
import {
  getMostRecentMeasurement,
  loadLatestCheckInMeasurements,
} from '@/api/CheckIn/checkInService';
import { adaptiveTdeeService } from '@/api/Settings/adaptiveTdeeService';
import { calculateBmr, BmrAlgorithm } from '@/services/bmrService';
import { userKeys } from '@/api/keys/admin';
import { exerciseEntryKeys } from '@/api/keys/exercises';
import { loadDailySummary } from '@/api/Diary/dailySummaryService';
import { fetchExerciseEntries } from '@/api/Exercises/exerciseEntryService';

export const useAdaptiveTdee = (date: string) => {
  return useQuery({
    queryKey: dailyProgressKeys.adaptiveTdee(date),
    queryFn: () => adaptiveTdeeService.getAdaptiveTdee(date),
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};

export const useDailySummary = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: dailyProgressKeys.summary(date),
    queryFn: () => loadDailySummary(date),
    enabled: !!date,
    meta: {
      errorMessage: t(
        'dailyProgress.summaryLoadError',
        'Failed to load daily summary.'
      ),
    },
  });
};

export const useDailyExerciseStats = (date: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: exerciseEntryKeys.dailyStats(date),
    queryFn: () => fetchExerciseEntries(date),
    enabled: !!date,
    select: (data) => {
      let activeCalories = 0;
      let otherCalories = 0;
      let activitySteps = 0;

      data.forEach((groupedEntry) => {
        if (groupedEntry.type === 'preset' && groupedEntry.exercises) {
          groupedEntry.exercises.forEach((entry) => {
            if (entry.exercise_snapshot?.name === 'Active Calories') {
              activeCalories += Number(entry.calories_burned || 0);
            } else {
              otherCalories += Number(entry.calories_burned || 0);
            }
            activitySteps += Number(entry.steps || 0);
          });
        } else if (groupedEntry.type === 'individual') {
          if (groupedEntry.exercise_snapshot?.name === 'Active Calories') {
            activeCalories += Number(groupedEntry.calories_burned || 0);
          } else {
            otherCalories += Number(groupedEntry.calories_burned || 0);
          }
          activitySteps += Number(groupedEntry.steps || 0);
        }
      });

      return {
        entries: data,
        activeCalories,
        otherCalories,
        activitySteps,
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
    queryFn: () => loadLatestCheckInMeasurements(date),
    enabled: !!date,
    select: (data) => {
      const steps = data?.steps || 0;
      return {
        steps,
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

export const useMostRecentBodyFatQuery = (enabled = true) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: dailyProgressKeys.measurements.mostRecent('body_fat_percentage'),
    queryFn: () => getMostRecentMeasurement('body_fat_percentage'),
    enabled,
    meta: {
      errorMessage: t(
        'measurements.errorLoadingBodyFat',
        'Failed to load most recent body fat.'
      ),
    },
  });
};

export const useMostRecentBmrQuery = (enabled = true) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: dailyProgressKeys.measurements.mostRecent('bmr'),
    queryFn: () => getMostRecentMeasurement('bmr'),
    enabled,
    meta: {
      errorMessage: t(
        'measurements.errorLoadingBmr',
        'Failed to load most recent BMR.'
      ),
    },
  });
};

export const useCalculatedBMR = () => {
  const { user } = useAuth();
  const { bmrAlgorithm, includeBmrInNetCalories, timezone } = usePreferences();

  const { data: userProfile } = useQuery({
    queryKey: userKeys.profile(user?.id ?? ''),
    queryFn: () => userManagementService.getUserProfile(),
    enabled: !!user?.id,
  });

  const { data: weightData } = useMostRecentWeightQuery();
  const { data: heightData } = useMostRecentHeightQuery();
  const { data: bodyFatData } = useMostRecentBodyFatQuery();
  const { data: bmrData } = useMostRecentBmrQuery();

  const rawMeasured = bmrData?.bmr ? Number(bmrData.bmr) : null;
  const isMeasured = Boolean(
    rawMeasured && rawMeasured >= 300 && rawMeasured <= 10000
  );

  if (isMeasured && rawMeasured !== null) {
    return {
      bmr: rawMeasured,
      measuredBmr: rawMeasured,
      includeInNet: includeBmrInNetCalories || false,
      weight: weightData?.weight || 0,
      height: heightData?.height || 0,
    };
  }

  if (
    !userProfile ||
    !weightData?.weight ||
    !heightData?.height ||
    !userProfile.gender
  ) {
    return { bmr: 0, includeInNet: false };
  }

  const age = userProfile.date_of_birth
    ? calculateAge(userProfile.date_of_birth, timezone)
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
      measuredBmr: null,
      includeInNet: includeBmrInNetCalories || false,
      weight: weightData.weight,
      height: heightData.height,
    };
  } catch (err) {
    return { bmr: 0, includeInNet: false, weight: 0, height: 0 };
  }
};
