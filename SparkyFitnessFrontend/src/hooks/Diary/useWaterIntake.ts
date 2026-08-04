import {
  getWaterGoalForDate,
  getWaterIntakeForDate,
  getWaterIntakeLog,
  deleteWaterIntakeLogEntry,
  updateWaterIntakeLogTime,
  UpdateWaterPayload,
  updateWaterIntake,
  WaterIntakeLogEntry,
} from '@/api/Diary/waterIntakteService';
import { waterIntakeKeys } from '@/api/keys/diary';
import { isManualSource } from '@/utils/sourceLabels';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDiaryInvalidation } from '../useInvalidateKeys';

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

/** Day totals split by origin: `manualMl` is the part the "-" control can remove. */
interface WaterIntakeTotals {
  totalMl: number;
  manualMl: number;
}

const fetchWaterIntakeTotals = async (
  date: string,
  userId: string
): Promise<WaterIntakeTotals> => {
  const waterData = await getWaterIntakeForDate(date, userId);
  if (Array.isArray(waterData)) {
    // Legacy per-source shape: sum the rows and pick out the manual ones.
    return waterData.reduce<WaterIntakeTotals>(
      (acc, record) => {
        const ml = Number(record.water_ml) || 0;
        acc.totalMl += ml;
        if (isManualSource(record.source)) acc.manualMl += ml;
        return acc;
      },
      { totalMl: 0, manualMl: 0 }
    );
  }
  if (waterData && waterData.water_ml !== undefined) {
    const totalMl = Number(waterData.water_ml) || 0;
    return {
      totalMl,
      // Servers predating the manual_ml breakdown report only the combined
      // total; treating it all as manual preserves the previous behaviour
      // (the "-" control stays enabled) rather than disabling it wrongly.
      manualMl:
        waterData.manual_ml !== undefined
          ? Number(waterData.manual_ml) || 0
          : totalMl,
    };
  }
  return { totalMl: 0, manualMl: 0 };
};

/**
 * Shared by useWaterIntakeQuery and useManualWaterIntakeQuery — same query key,
 * so both hooks read one cached fetch and differ only in what they select.
 */
const waterIntakeTotalsOptions = (date: string, userId?: string) => ({
  queryKey: waterIntakeKeys.daily(date, userId!),
  queryFn: () => fetchWaterIntakeTotals(date, userId!),
  enabled: !!userId && !!date,
});

export const useWaterIntakeQuery = (date: string, userId?: string) => {
  return useQuery({
    ...waterIntakeTotalsOptions(date, userId),
    select: (totals: WaterIntakeTotals) => totals.totalMl,
  });
};

/**
 * Manually logged portion of the day's water. Only this part can be removed by
 * the diary "-" control, so it drives that button's disabled state — the
 * combined total would leave it enabled against provider-synced water it can't
 * actually decrement.
 */
export const useManualWaterIntakeQuery = (date: string, userId?: string) => {
  return useQuery({
    ...waterIntakeTotalsOptions(date, userId),
    select: (totals: WaterIntakeTotals) => totals.manualMl,
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
      // Also invalidate the log since a new entry was added
      queryClient.invalidateQueries({
        queryKey: waterIntakeKeys.log(variables.entry_date, variables.user_id),
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

export const useWaterIntakeLogQuery = (date: string, userId?: string) => {
  return useQuery<WaterIntakeLogEntry[]>({
    queryKey: waterIntakeKeys.log(date, userId!),
    queryFn: () => getWaterIntakeLog(date, userId!),
    enabled: !!userId && !!date,
  });
};

export const useDeleteWaterIntakeLogMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: (logId: string) => deleteWaterIntakeLogEntry(logId),
    onSuccess: () => {
      // Invalidate all water intake queries (total + log)
      queryClient.invalidateQueries({
        queryKey: waterIntakeKeys.all,
      });
      invalidate();
    },
    meta: {
      successMessage: t(
        'foodDiary.waterIntake.deletedSuccess',
        'Drink removed'
      ),
      errorMessage: t(
        'foodDiary.waterIntake.deletedError',
        'Failed to remove drink'
      ),
    },
  });
};

export const useUpdateWaterIntakeLogTimeMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ logId, loggedAt }: { logId: string; loggedAt: string }) =>
      updateWaterIntakeLogTime(logId, loggedAt),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: waterIntakeKeys.all,
      });
    },
  });
};
