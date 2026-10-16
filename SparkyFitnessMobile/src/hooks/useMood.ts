import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  fetchCustomMoods,
  fetchMoodEntries,
  saveMoodEntry,
  type MoodEntry,
  type SaveMoodEntryBody,
} from '../services/api/moodApi';
import { addLog } from '../services/LogService';
import { addDays, getTodayDate, normalizeDate } from '../utils/dateUtils';
import { RANGE_DAYS, type HealthTrendDateRange } from '../types/healthTrends';
import {
  customMoodsQueryKey,
  moodEntriesQueryKey,
  moodEntriesRootQueryKey,
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
      entries.map((entry) => ({
        day: entry.entry_date,
        mood: entry.mood_value,
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
    queryKey: moodEntriesQueryKey(date, date),
    queryFn: async () => {
      const entries = await fetchMoodEntries(date, date);
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

export function useSaveMood() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: SaveMoodEntryBody) => saveMoodEntry(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: moodEntriesRootQueryKey }),
    onError: (error: Error) => {
      addLog(`[Mood] Failed to save mood entry: ${error.message}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('mood.saveFailed', { defaultValue: 'Could not save mood' }),
      });
    },
  });
}
