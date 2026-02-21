import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sleepKeys } from '@/api/keys/checkin';
import {
  deleteSleepEntry,
  getSleepEntries,
  saveSleepEntry,
  updateSleepEntry,
} from '@/api/CheckIn/sleep';
import { SleepEntry } from '@/types';
import { useTranslation } from 'react-i18next';

export const useSleepEntriesQuery = (startDate: string, endDate: string) => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: sleepKeys.details(startDate, endDate),
    queryFn: () => getSleepEntries(startDate, endDate),
    enabled: !!startDate && !!endDate,
    meta: {
      errorMessage: t(
        'sleepEntrySection.failedToLoadSleepEntries',
        'Failed to load sleep entries'
      ),
    },
  });
};
export const useSaveSleepEntryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: saveSleepEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sleepKeys.all });
    },
    meta: {
      successMessage: t(
        'sleepEntrySection.sleepEntriesSavedSuccessfully',
        'Sleep entries saved successfully!'
      ),
      errorMessage: t(
        'sleepEntrySection.failedToSaveSleepEntry',
        'Failed to save sleep entry'
      ),
    },
  });
};

export const useUpdateSleepEntryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SleepEntry> }) =>
      updateSleepEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sleepKeys.all });
    },
    meta: {
      successMessage: t(
        'sleepEntrySection.stagesUpdatedSuccessfully',
        'Sleep stages and times updated successfully!'
      ),
      errorMessage: t(
        'sleepEntrySection.failedToUpdateSleepStages',
        'Failed to update sleep stages and times'
      ),
    },
  });
};

export const useDeleteSleepEntryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: deleteSleepEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sleepKeys.all });
    },
    meta: {
      successMessage: t(
        'sleepEntrySection.sleepEntryDeletedSuccessfully',
        'Sleep entry deleted successfully!'
      ),
      errorMessage: t(
        'sleepEntrySection.failedToDeleteSleepEntry',
        'Failed to delete sleep entry'
      ),
    },
  });
};
