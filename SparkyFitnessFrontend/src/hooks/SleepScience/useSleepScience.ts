import { sleepScienceKeys } from '@/api/keys/sleepScience';
import {
    calculateBaseline,
    getChronotype,
    getDailyNeed,
    getDataSufficiency,
    getEnergyCurve,
    getMCTQStats,
    getSleepDebt,
} from '@/api/SleepScience/sleepScience';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useSleepDebtQuery = (targetUserId?: string) => {
  return useQuery({
    queryKey: sleepScienceKeys.sleepDebt(targetUserId),
    queryFn: () => getSleepDebt(targetUserId),
    staleTime: 5 * 60 * 1000, // 5 min
  });
};

export const useMCTQStatsQuery = (targetUserId?: string) => {
  return useQuery({
    queryKey: sleepScienceKeys.mctqStats(targetUserId),
    queryFn: () => getMCTQStats(targetUserId),
    staleTime: 10 * 60 * 1000, // 10 min
  });
};

export const useDailyNeedQuery = (date?: string, targetUserId?: string) => {
  const today = date || new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: sleepScienceKeys.dailyNeed(today, targetUserId),
    queryFn: () => getDailyNeed(today, targetUserId),
    staleTime: 5 * 60 * 1000,
  });
};

export const useEnergyCurveQuery = (targetUserId?: string) => {
  return useQuery({
    queryKey: sleepScienceKeys.energyCurve(targetUserId),
    queryFn: () => getEnergyCurve(targetUserId),
    staleTime: 5 * 60 * 1000,
  });
};

export const useChronotypeQuery = (targetUserId?: string) => {
  return useQuery({
    queryKey: sleepScienceKeys.chronotype(targetUserId),
    queryFn: () => getChronotype(targetUserId),
    staleTime: 30 * 60 * 1000, // 30 min — stable data
  });
};

export const useDataSufficiencyQuery = (targetUserId?: string) => {
  return useQuery({
    queryKey: sleepScienceKeys.dataSufficiency(targetUserId),
    queryFn: () => getDataSufficiency(targetUserId),
    staleTime: 10 * 60 * 1000,
  });
};

export const useCalculateBaselineMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (windowDays?: number) => calculateBaseline(windowDays),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sleepScienceKeys.all });
    },
    meta: {
      successMessage: t(
        'sleepScience.baselineCalculated',
        'Sleep need baseline calculated successfully'
      ),
      errorMessage: t(
        'sleepScience.baselineError',
        'Failed to calculate sleep need baseline'
      ),
    },
  });
};
