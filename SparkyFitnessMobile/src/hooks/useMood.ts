import { useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  dailyMoodSeries,
  type MoodCheckinCreateBody,
  type MoodCheckinUpdateBody,
} from '@workspace/shared';
import {
  createMoodCheckin,
  deleteMoodCheckin,
  fetchCustomMoods,
  fetchLegacyMoodEntries,
  fetchMoodCheckinsForDate,
  fetchMoodEntries,
  saveMoodEntry,
  updateMoodCheckin,
  type MoodEntry,
  type SaveMoodEntryBody,
} from '../services/api/moodApi';
import { addLog } from '../services/LogService';
import { addDays, getTodayDate, normalizeDate } from '../utils/dateUtils';
import { RANGE_DAYS, type HealthTrendDateRange } from '../types/healthTrends';
import {
  customMoodsQueryKey,
  cycleCorrelationsQueryKey,
  moodCheckinsQueryKey,
  moodCheckinsSupportQueryKey,
  moodEntriesQueryKey,
  moodEntriesRootQueryKey,
  moodLegacyDayQueryKey,
  moodRatingsSupportQueryKey,
} from './queryKeys';

export type MoodDataPoint = {
  day: string;
  mood: number;
};

export function useMoodEntries(range: HealthTrendDateRange) {
  const today = getTodayDate();
  const startDate = addDays(today, -(RANGE_DAYS[range] - 1));

  const query = useQuery({
    queryKey: moodEntriesQueryKey(startDate, today),
    queryFn: () => fetchMoodEntries(startDate, today),
  });

  const entries = useMemo<MoodEntry[]>(
    () =>
      (query.data ?? [])
        .map((entry) => ({
          ...entry,
          entry_date: normalizeDate(entry.entry_date),
        }))
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
    [query.data]
  );

  const points = useMemo<MoodDataPoint[]>(
    () =>
      dailyMoodSeries(entries).map(({ date, mood_value }) => ({
        day: date,
        mood: mood_value,
      })),
    [entries]
  );

  return {
    entries,
    points,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Entries between two calendar days (inclusive), with normalized dates. */
export function useMoodEntriesBetween(startDate: string, endDate: string) {
  const query = useQuery({
    queryKey: moodEntriesQueryKey(startDate, endDate),
    queryFn: () => fetchMoodEntries(startDate, endDate),
  });
  return useMemo<MoodEntry[]>(
    () =>
      (query.data ?? []).map((entry) => ({
        ...entry,
        entry_date: normalizeDate(entry.entry_date),
      })),
    [query.data]
  );
}

/** The entry logged for one calendar day, or null when there is none. */
export function useMoodEntryForDate(date: string) {
  const query = useQuery({
    queryKey: moodLegacyDayQueryKey(date),
    queryFn: async () => {
      const entries = await fetchLegacyMoodEntries(date, date);
      return entries[0] ?? null;
    },
  });
  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useCustomMoods() {
  const query = useQuery({
    queryKey: customMoodsQueryKey,
    queryFn: fetchCustomMoods,
  });
  return query.data ?? [];
}

/** Server probes whose known answer only changes with a server upgrade. */
const serverProbeKeys = [
  moodRatingsSupportQueryKey,
  moodCheckinsSupportQueryKey,
];

/**
 * Refresh every mood query after a write, except a server probe that already
 * has an answer: it is re-checked only while still unknown (no rows saved
 * before, or the probe failed). A dashboard refresh or an account switch
 * still starts over.
 */
function invalidateMoodEntries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: moodEntriesRootQueryKey,
    predicate: (query) =>
      !serverProbeKeys.some((key) => key[1] === query.queryKey[1]) ||
      query.state.data == null,
  });
}

export function useSaveMood() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: SaveMoodEntryBody) => saveMoodEntry(body),
    onSuccess: () => invalidateMoodEntries(queryClient),
    onError: (error: Error) => {
      addLog(`[Mood] Failed to save mood entry: ${error.message}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('mood.saveFailed', { defaultValue: 'Could not save mood' }),
      });
    },
  });
}

/** A day's check-ins (v2 servers); null when the server answers the old way. */
export function useMoodCheckinsForDate(date: string) {
  const query = useQuery({
    queryKey: moodCheckinsQueryKey(date),
    queryFn: () => fetchMoodCheckinsForDate(date),
  });
  return {
    checkins: query.data ?? null,
    isLoading: query.isLoading,
    /** Also true while a cached list is being refreshed. */
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Mood feeds the cycle correlations too, so every write refreshes both. */
function useInvalidateAfterMoodWrite() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      invalidateMoodEntries(queryClient),
      queryClient.invalidateQueries({ queryKey: cycleCorrelationsQueryKey }),
    ]);
}

export function useCreateMoodCheckin() {
  const invalidate = useInvalidateAfterMoodWrite();
  return useMutation({
    mutationFn: (body: MoodCheckinCreateBody) => createMoodCheckin(body),
    onSuccess: invalidate,
  });
}

export function useUpdateMoodCheckin() {
  const invalidate = useInvalidateAfterMoodWrite();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoodCheckinUpdateBody }) =>
      updateMoodCheckin(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteMoodCheckin() {
  const invalidate = useInvalidateAfterMoodWrite();
  return useMutation({
    mutationFn: (id: string) => deleteMoodCheckin(id),
    onSuccess: invalidate,
  });
}
