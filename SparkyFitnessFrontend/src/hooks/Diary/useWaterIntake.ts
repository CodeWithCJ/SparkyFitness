import {
  getWaterGoalForDate,
  getWaterIntakeForDate,
  UpdateWaterPayload,
  updateWaterIntake,
} from '@/api/Diary/waterIntakteService';
import { waterIntakeKeys } from '@/api/keys/diary';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDiaryInvalidation } from './useDiaryInvalidation';

export const useWaterGoalQuery = (date: string, userId?: string) => {
  return useQuery({
    queryKey: waterIntakeKeys.goals(date, userId!),
    queryFn: async () => {
      const goalData = await getWaterGoalForDate(date, userId!);
      if (
        goalData &&
        goalData.water_goal_ml !== undefined &&
        goalData.water_goal_ml !== null &&
        Number(goalData.water_goal_ml) !== 0
      ) {
        return Number(goalData.water_goal_ml);
      }
      return 1920; // Default Goal
    },
    enabled: !!userId && !!date,
  });
};

export const useWaterIntakeQuery = (date: string, userId?: string) => {
  return useQuery({
    queryKey: waterIntakeKeys.daily(date, userId!),
    queryFn: async () => {
      const waterData = await getWaterIntakeForDate(date, userId!);
      if (Array.isArray(waterData) && waterData.length > 0) {
        return waterData.reduce(
          (sum, record) => sum + Number(record.water_ml),
          0
        );
      } else if (waterData && waterData.water_ml !== undefined) {
        return Number(waterData.water_ml);
      }
      return 0;
    },
    enabled: !!userId && !!date,
  });
};

export const useUpdateWaterIntakeMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const invalidate = useDiaryInvalidation();
  return useMutation({
    mutationFn: (payload: UpdateWaterPayload) => updateWaterIntake(payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: waterIntakeKeys.daily(
          variables.entry_date,
          variables.user_id
        ),
      });
      invalidate();
    },
    meta: {
      successMessage: t(
        'foodDiary.waterIntake.updated',
        'Water intake updated'
      ),
      errorMessage: t(
        'foodDiary.waterIntake.updateError',
        'Failed to save water intake'
      ),
    },
  });
};
