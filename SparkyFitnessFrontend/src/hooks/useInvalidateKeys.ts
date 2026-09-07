import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  exerciseEntryKeys,
  exerciseKeys,
  presetKeys,
} from '@/api/keys/exercises';
import {
  caffeineKeys,
  dailyProgressKeys,
  diaryReportKeys,
  foodEntryKeys,
  foodEntryMealKeys,
  waterIntakeKeys,
} from '@/api/keys/diary';
import { checkInKeys, sleepKeys } from '@/api/keys/checkin';
import { chatbotKeys } from '@/api/keys/ai';
import { foodKeys, mealKeys } from '@/api/keys/meals';
import { userAiConfigKeys } from '@/api/keys/admin';
import { goalKeys } from '@/api/keys/goals';
import { reportKeys } from '@/api/keys/reports';

export const useDiaryInvalidation = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
    queryClient.invalidateQueries({ queryKey: exerciseKeys.all });
    queryClient.invalidateQueries({ queryKey: presetKeys.all });
    queryClient.invalidateQueries({ queryKey: dailyProgressKeys.all });
    queryClient.invalidateQueries({ queryKey: foodEntryKeys.all });
    queryClient.invalidateQueries({ queryKey: foodEntryMealKeys.all });
    queryClient.invalidateQueries({ queryKey: diaryReportKeys.all });
    queryClient.invalidateQueries({ queryKey: foodKeys.all });
    queryClient.invalidateQueries({ queryKey: mealKeys.all });
    queryClient.invalidateQueries({ queryKey: waterIntakeKeys.all });
    // A linked water container logs a coffee as a food entry, so pressing "+"
    // moves the caffeine curve as surely as logging one by hand does.
    queryClient.invalidateQueries({ queryKey: caffeineKeys.all });
    queryClient.invalidateQueries({ queryKey: checkInKeys.all });
    queryClient.invalidateQueries({ queryKey: sleepKeys.all });
    queryClient.invalidateQueries({ queryKey: goalKeys.all });
    queryClient.invalidateQueries({ queryKey: reportKeys.all });
  }, [queryClient]);
};

export const useChatInvalidation = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: chatbotKeys.all,
    });
  }, [queryClient]);
};

export const useFoodEntryInvalidation = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: foodEntryMealKeys.all });
    queryClient.invalidateQueries({ queryKey: foodEntryKeys.all });
    queryClient.invalidateQueries({ queryKey: dailyProgressKeys.all });
    queryClient.invalidateQueries({ queryKey: diaryReportKeys.all });
    queryClient.invalidateQueries({ queryKey: reportKeys.all });
    queryClient.invalidateQueries({ queryKey: foodKeys.all });
    queryClient.invalidateQueries({ queryKey: mealKeys.all });
    // A food entry created from a water container owns its water log row
    // (ON DELETE CASCADE), so deleting the food changes the day's water too.
    queryClient.invalidateQueries({ queryKey: waterIntakeKeys.all });
    // Caffeine kinetics is a derived view over the same entries: logging or
    // editing a coffee moves the whole curve, and its query is keyed by date
    // rather than by entry, so nothing else would refresh it.
    queryClient.invalidateQueries({ queryKey: caffeineKeys.all });
  }, [queryClient]);
};

export const useMealInvalidation = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: mealKeys.all });
    queryClient.invalidateQueries({ queryKey: foodKeys.all });
    queryClient.invalidateQueries({ queryKey: foodEntryMealKeys.all });
    queryClient.invalidateQueries({ queryKey: diaryReportKeys.all });
    queryClient.invalidateQueries({ queryKey: dailyProgressKeys.all });
    queryClient.invalidateQueries({ queryKey: reportKeys.all });
  }, [queryClient]);
};

export const useDailyProgressInvalidation = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: dailyProgressKeys.all,
    });
  }, [queryClient]);
};

export const useAiConfigInvalidation = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: userAiConfigKeys.all,
    });
  }, [queryClient]);
};
