import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import {
  saveMoodEntry,
  getMoodEntries,
  getMoodEntryByDate,
  getMoodEntryById,
  updateMoodEntry,
  deleteMoodEntry,
} from '@/api/CheckIn/moodService';
import { moodKeys } from '@/api/keys/checkin';

export const useMoodEntries = (
  startDate: string,
  endDate: string,
  userId?: string
) => {
  return useQuery({
    queryKey: moodKeys.list(startDate, endDate, userId),
    queryFn: () => getMoodEntries(startDate, endDate, userId),
    meta: {
      errorMessage: i18n.t(
        'mood.failedToLoadEntries',
        'Failed to load mood entries.'
      ),
    },
  });
};

export const useMoodEntryByDate = (entryDate: string) => {
  return useQuery({
    queryKey: moodKeys.byDate(entryDate),
    queryFn: () => getMoodEntryByDate(entryDate),
    meta: {
      errorMessage: i18n.t(
        'mood.failedToLoadEntry',
        'Failed to load mood entry.'
      ),
    },
  });
};

export const useMoodEntryById = (id: string) => {
  return useQuery({
    queryKey: moodKeys.detail(id),
    queryFn: () => getMoodEntryById(id),
    meta: {
      errorMessage: i18n.t(
        'mood.failedToLoadEntry',
        'Failed to load mood entry.'
      ),
    },
  });
};

export const useSaveMoodEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      moodValue,
      notes,
      entryDate,
    }: {
      moodValue: number;
      notes: string;
      entryDate: string;
    }) => saveMoodEntry(moodValue, notes, entryDate),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: moodKeys.all });
    },
    meta: {
      errorMessage: i18n.t('mood.failedToSave', 'Failed to save mood entry.'),
      successMessage: i18n.t(
        'mood.savedSuccessfully',
        'Mood entry saved successfully.'
      ),
    },
  });
};

export const useUpdateMoodEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      moodValue,
      notes,
      entryDate,
    }: {
      id: string;
      moodValue: number | null;
      notes: string;
      entryDate: string;
    }) => updateMoodEntry(id, moodValue, notes, entryDate),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: moodKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'mood.failedToUpdate',
        'Failed to update mood entry.'
      ),
      successMessage: i18n.t(
        'mood.updatedSuccessfully',
        'Mood entry updated successfully.'
      ),
    },
  });
};

export const useDeleteMoodEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMoodEntry(id),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: moodKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'mood.failedToDelete',
        'Failed to delete mood entry.'
      ),
      successMessage: i18n.t(
        'mood.deletedSuccessfully',
        'Mood entry deleted successfully.'
      ),
    },
  });
};
