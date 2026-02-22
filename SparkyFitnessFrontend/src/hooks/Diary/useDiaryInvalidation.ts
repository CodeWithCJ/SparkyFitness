import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { exerciseEntryKeys } from '@/api/keys/exercises';
import { dailyProgressKeys, foodEntryKeys } from '@/api/keys/diary';
import { checkInKeys, sleepKeys } from '@/api/keys/checkin';

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
