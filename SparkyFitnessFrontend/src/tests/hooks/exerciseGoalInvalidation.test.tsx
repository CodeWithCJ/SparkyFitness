import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCreatePresetSessionMutation,
  useDeleteExercisePresetEntryMutation,
  useLogWorkoutPresetMutation,
} from '@/hooks/Exercises/useExerciseEntries';
import { useExerciseInvalidation } from '@/hooks/useInvalidateKeys';
import { useDiaryGoals } from '@/hooks/Diary/useFoodEntries';
import { loadDiaryGoals } from '@/api/Diary/foodEntryService';
import {
  createPresetSession,
  deleteExercisePresetEntry,
  logWorkoutPreset,
} from '@/api/Exercises/exerciseEntryService';
import { DEFAULT_GOALS } from '@/constants/goals';

jest.mock('@/api/Diary/foodEntryService', () => ({
  loadDiaryGoals: jest.fn(),
}));
jest.mock('@/api/Exercises/exerciseEntryService', () => ({
  createPresetSession: jest.fn(),
  deleteExercisePresetEntry: jest.fn(),
  logWorkoutPreset: jest.fn(),
}));
jest.mock('@/i18n', () => ({
  t: (_key: string, fallback: string) => fallback,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const date = '2026-11-01';

function useLogPreset() {
  const mutation = useLogWorkoutPresetMutation();
  return () => mutation.mutateAsync({ presetId: '1', date });
}

function useCreateSession() {
  const mutation = useCreatePresetSessionMutation();
  return () =>
    mutation.mutateAsync({
      workout_preset_id: 1,
      entry_date: date,
      source: 'manual',
    });
}

function useDeleteSession() {
  const mutation = useDeleteExercisePresetEntryMutation();
  return () => mutation.mutateAsync('session-1');
}

describe('exercise changes refresh cached diary macro goals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(logWorkoutPreset).mockResolvedValue(undefined);
    jest.mocked(deleteExercisePresetEntry).mockResolvedValue(undefined);
    jest.mocked(createPresetSession).mockResolvedValue({
      type: 'preset',
      id: 'session-1',
      entry_date: date,
      workout_preset_id: 1,
      name: 'Evening run',
      description: null,
      notes: null,
      source: 'manual',
      total_duration_minutes: 45,
      exercises: [],
      activity_details: [],
    });
  });

  it.each([
    {
      action: 'log a preset',
      useAction: useLogPreset,
      before: 150,
      after: 187.5,
    },
    {
      action: 'create a session',
      useAction: useCreateSession,
      before: 150,
      after: 187.5,
    },
    {
      action: 'delete a preset session',
      useAction: useDeleteSession,
      before: 187.5,
      after: 150,
    },
    {
      action: 'change exercise history',
      useAction: useExerciseInvalidation,
      before: 187.5,
      after: 150,
    },
  ])(
    'updates the displayed goals after $action without reloading',
    async ({ useAction, before, after }) => {
      let serverProtein = before;
      jest.mocked(loadDiaryGoals).mockImplementation(async () => ({
        ...DEFAULT_GOALS,
        calories: 2000,
        protein: serverProtein,
        carbs: (serverProtein * 5) / 3,
        fat: (serverProtein * 8) / 27,
      }));
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const { result, unmount } = renderHook(
        () => ({
          perform: useAction(),
          goals: useDiaryGoals(date),
        }),
        { wrapper }
      );

      try {
        await waitFor(() =>
          expect(result.current.goals.data?.protein).toBe(before)
        );
        // The server now returns the post-mutation goal. Only invalidating the
        // adjusted-goals query can replace the already displayed cached value.
        serverProtein = after;
        await act(async () => {
          await result.current.perform();
        });
        await waitFor(() =>
          expect(result.current.goals.data?.protein).toBe(after)
        );
        expect(loadDiaryGoals).toHaveBeenLastCalledWith(date, true);
      } finally {
        unmount();
        client.clear();
      }
    }
  );
});
