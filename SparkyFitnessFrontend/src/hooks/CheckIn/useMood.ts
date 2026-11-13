import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import i18n from 'i18next';
import type {
  MoodCheckinCreateBody,
  MoodCheckinUpdateBody,
} from '@workspace/shared';
import { HttpApiError } from '@/api/api';
import {
  getMoodCheckinsByDate,
  createMoodCheckin,
  updateMoodCheckin,
  deleteMoodCheckin,
  getMoodEntries,
  listCustomMoods,
  createCustomMood,
  deleteCustomMood,
  getMoodDisplayPreferences,
  updateMoodDisplayPreferences,
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

/**
 * A check-in request's error toast: the server's own message when it sent one
 * (such as why a check-in was rejected), otherwise `fallback`.
 */
const serverMessageOr = (fallback: string) => (err: unknown) =>
  err instanceof HttpApiError && err.message ? err.message : fallback;

export const useMoodCheckinsByDate = (date: string) =>
  useQuery({
    queryKey: moodKeys.byDate(date),
    queryFn: () => getMoodCheckinsByDate(date),
    meta: {
      errorMessage: i18n.t(
        'mood.failedToLoadEntries',
        'Failed to load mood entries.'
      ),
    },
  });

/** A check-in change reaches the mood views and the cycle correlations. */
const invalidateMoodCaches = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: moodKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['cycle-correlations'] }),
  ]);

export const useCreateMoodCheckinMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MoodCheckinCreateBody) => createMoodCheckin(body),
    onSuccess: () => invalidateMoodCaches(queryClient),
    meta: {
      errorMessage: serverMessageOr(
        i18n.t('mood.failedToSave', 'Failed to save mood entry.')
      ),
      successMessage: i18n.t('checkIn.checkinSaved', 'Check-in saved'),
    },
  });
};

export const useUpdateMoodCheckinMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoodCheckinUpdateBody }) =>
      updateMoodCheckin(id, body),
    onSuccess: () => invalidateMoodCaches(queryClient),
    meta: {
      errorMessage: serverMessageOr(
        i18n.t('mood.failedToUpdate', 'Failed to update mood entry.')
      ),
      successMessage: i18n.t('checkIn.checkinUpdated', 'Check-in updated'),
    },
  });
};

export const useDeleteMoodCheckinMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMoodCheckin(id),
    onSuccess: () => invalidateMoodCaches(queryClient),
    meta: {
      errorMessage: serverMessageOr(
        i18n.t('mood.failedToDelete', 'Failed to delete mood entry.')
      ),
      successMessage: i18n.t('checkIn.checkinDeleted', 'Check-in deleted'),
    },
  });
};

// --- Custom moods (user-defined mood tags) ---------------------------------

export const useCustomMoods = () =>
  useQuery({
    queryKey: ['custom-moods'],
    queryFn: () => listCustomMoods(),
    meta: {
      errorMessage: i18n.t('mood.failedToLoadCustom', 'Failed to load moods.'),
    },
  });

export const useCreateCustomMoodMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      display_name?: string;
      icon?: string;
      color?: string;
    }) => createCustomMood(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['custom-moods'] }),
    meta: {
      errorMessage: i18n.t('mood.failedAddCustom', 'Could not add mood.'),
    },
  });
};

export const useDeleteCustomMoodMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      deleteAllHistory,
    }: {
      id: string;
      deleteAllHistory?: boolean;
    }) => deleteCustomMood(id, deleteAllHistory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-moods'] });
      queryClient.invalidateQueries({ queryKey: moodKeys.all });
    },
    meta: {
      errorMessage: i18n.t('mood.failedDeleteCustom', 'Could not remove mood.'),
    },
  });
};

export const useMoodDisplayPreferences = () =>
  useQuery({
    queryKey: ['mood-display-preferences'],
    queryFn: () => getMoodDisplayPreferences(),
    meta: {
      errorMessage: i18n.t(
        'mood.failedLoadPrefs',
        'Failed to load mood prefs.'
      ),
    },
  });

export const useUpdateMoodDisplayPreferencesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hiddenMoods: string[]) =>
      updateMoodDisplayPreferences(hiddenMoods),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['mood-display-preferences'] }),
    meta: {
      errorMessage: i18n.t('mood.failedSavePrefs', 'Could not update moods.'),
    },
  });
};
