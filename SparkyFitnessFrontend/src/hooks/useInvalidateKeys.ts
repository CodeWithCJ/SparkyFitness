import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { exerciseEntryKeys, exerciseKeys } from '@/api/keys/exercises';
import { dailyProgressKeys, foodEntryKeys } from '@/api/keys/diary';
import { checkInKeys, sleepKeys } from '@/api/keys/checkin';
import { chatbotKeys } from '@/api/keys/ai';
import { mealKeys } from '@/api/keys/meals';
import { userAiConfigKeys } from '@/api/keys/admin';

export const useDiaryInvalidation = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: exerciseEntryKeys.all });
    queryClient.invalidateQueries({ queryKey: dailyProgressKeys.all });
    queryClient.invalidateQueries({ queryKey: foodEntryKeys.all });
    queryClient.invalidateQueries({ queryKey: checkInKeys.all });
    queryClient.invalidateQueries({ queryKey: sleepKeys.all });
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

export const useExerciseInvalidation = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: exerciseKeys.lists(),
    });
  }, [queryClient]);
};

export const useMealInvalidation = () => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: mealKeys.all,
    });
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
