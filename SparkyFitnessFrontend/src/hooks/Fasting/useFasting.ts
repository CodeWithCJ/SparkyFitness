import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import {
  startFast,
  endFast,
  getCurrentFast,
  getFastingHistory,
  getFastingStats,
  getFastingDataRange,
  updateFast,
} from '@/api/Fasting/fastingService';
import { fastingKeys } from '@/api/keys/fasting';
import { FastingLog } from '@/types/fasting';

export const useCurrentFast = () => {
  return useQuery({
    queryKey: fastingKeys.current(),
    queryFn: getCurrentFast,
    meta: {
      errorMessage: i18n.t(
        'fasting.failedToLoadCurrent',
        'Failed to load current fast.'
      ),
    },
  });
};

export const useFastingHistory = (limit: number = 20, offset: number = 0) => {
  return useQuery({
    queryKey: fastingKeys.list(limit, offset),
    queryFn: () => getFastingHistory(limit, offset),
    meta: {
      errorMessage: i18n.t(
        'fasting.failedToLoadHistory',
        'Failed to load fasting history.'
      ),
    },
  });
};

export const useFastingStats = () => {
  return useQuery({
    queryKey: fastingKeys.stats(),
    queryFn: getFastingStats,
    meta: {
      errorMessage: i18n.t(
        'fasting.failedToLoadStats',
        'Failed to load fasting stats.'
      ),
    },
  });
};

export const useFastingDataRange = (startDate: string, endDate: string) => {
  return useQuery({
    queryKey: fastingKeys.range(startDate, endDate),
    queryFn: () => getFastingDataRange(startDate, endDate),
    meta: {
      errorMessage: i18n.t(
        'fasting.failedToLoadRange',
        'Failed to load fasting data for range.'
      ),
    },
  });
};

export const useStartFastMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      startTime,
      targetEndTime,
      fastingType,
    }: {
      startTime: Date;
      targetEndTime: Date;
      fastingType: string;
    }) => startFast(startTime, targetEndTime, fastingType),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: fastingKeys.all });
    },
    meta: {
      errorMessage: i18n.t('fasting.failedToStart', 'Failed to start fast.'),
      successMessage: i18n.t(
        'fasting.startedSuccessfully',
        'Fast started successfully.'
      ),
    },
  });
};

export const useEndFastMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      startTime,
      endTime,
      weight,
      mood,
    }: {
      id: string;
      startTime: Date;
      endTime: Date;
      weight?: number;
      mood?: { value: number; notes: string };
    }) => endFast(id, startTime, endTime, weight, mood),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: fastingKeys.all });
    },
    meta: {
      errorMessage: i18n.t('fasting.failedToEnd', 'Failed to end fast.'),
      successMessage: i18n.t(
        'fasting.endedSuccessfully',
        'Fast ended successfully.'
      ),
    },
  });
};

export const useUpdateFastMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<FastingLog>;
    }) => updateFast(id, updates),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: fastingKeys.all });
    },
    meta: {
      errorMessage: i18n.t('fasting.failedToUpdate', 'Failed to update fast.'),
      successMessage: i18n.t(
        'fasting.updatedSuccessfully',
        'Fast updated successfully.'
      ),
    },
  });
};
