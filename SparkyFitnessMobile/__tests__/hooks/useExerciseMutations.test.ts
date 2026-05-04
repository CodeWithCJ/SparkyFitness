import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  useCreateWorkout,
  useUpdateWorkout,
  useCreateExerciseEntry,
  useUpdateExerciseEntry,
  useDeleteWorkout,
  useDeleteExerciseEntry,
  useCreateExercise,
  useUpdateExercise,
  useDeleteExerciseLibrary,
} from '../../src/hooks/useExerciseMutations';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';
import type { QueryClient } from './queryTestUtils';

// Mock API functions
jest.mock('../../src/services/api/exerciseApi', () => ({
  createWorkout: jest.fn(),
  updateWorkout: jest.fn(),
  deleteWorkout: jest.fn(),
  createExerciseEntry: jest.fn(),
  updateExerciseEntry: jest.fn(),
  deleteExerciseEntry: jest.fn(),
  createExercise: jest.fn(),
  updateExercise: jest.fn(),
  deleteExerciseFromLibrary: jest.fn(),
}));

jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

jest.mock('../../src/hooks/syncExerciseSessionInCache', () => ({
  syncExerciseSessionInCache: jest.fn(),
}));

jest.mock('../../src/utils/dateUtils', () => ({
  normalizeDate: (d: string) => d.split('T')[0],
}));

const {
  createWorkout: mockCreateWorkout,
  updateWorkout: mockUpdateWorkout,
  deleteWorkout: mockDeleteWorkout,
  createExerciseEntry: mockCreateExerciseEntry,
  updateExerciseEntry: mockUpdateExerciseEntry,
  deleteExerciseEntry: mockDeleteExerciseEntry,
  createExercise: mockCreateExercise,
  updateExercise: mockUpdateExercise,
  deleteExerciseFromLibrary: mockDeleteExerciseFromLibrary,
} = jest.requireMock('../../src/services/api/exerciseApi');

const { invalidateExerciseCache: mockInvalidateCache } = jest.requireMock(
  '../../src/hooks/invalidateExerciseCache',
);

const { syncExerciseSessionInCache: mockSyncCache } = jest.requireMock(
  '../../src/hooks/syncExerciseSessionInCache',
);

describe('useExerciseMutations', () => {
  let queryClient: QueryClient;
  let wrapper: ReturnType<typeof createQueryWrapper>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    queryClient = createTestQueryClient();
    wrapper = createQueryWrapper(queryClient);
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('useCreateWorkout', () => {
    it('calls createWorkout API and returns result', async () => {
      const responseData = { id: 'session-1', type: 'preset', name: 'Push Day' };
      mockCreateWorkout.mockResolvedValue(responseData);

      const { result } = renderHook(() => useCreateWorkout(), { wrapper });

      let createResult: unknown;
      await act(async () => {
        createResult = await result.current.createSession({ name: 'Push Day', exercises: [] } as any);
      });

      expect(mockCreateWorkout).toHaveBeenCalledWith({ name: 'Push Day', exercises: [] });
      expect(createResult).toEqual(responseData);
    });

    it('shows alert on error', async () => {
      mockCreateWorkout.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useCreateWorkout(), { wrapper });

      await act(async () => {
        try {
          await result.current.createSession({ name: 'Push Day', exercises: [] } as any);
        } catch {
          // expected
        }
      });

      await waitFor(() => {
        expect(Toast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Failed to save workout',
          text2: 'Please try again.',
        });
      });
    });

    it('invalidateCache calls invalidateExerciseCache', async () => {
      const { result } = renderHook(() => useCreateWorkout(), { wrapper });

      await act(async () => {
        result.current.invalidateCache('2026-03-20');
      });

      expect(mockInvalidateCache).toHaveBeenCalledWith(queryClient, '2026-03-20');
    });
  });

  describe('useUpdateWorkout', () => {
    it('calls updateWorkout API and syncs cache on success', async () => {
      const responseData = { id: 'session-1', type: 'preset', name: 'Updated' };
      mockUpdateWorkout.mockResolvedValue(responseData);

      const { result } = renderHook(() => useUpdateWorkout(), { wrapper });

      await act(async () => {
        await result.current.updateSession({
          id: 'session-1',
          payload: { name: 'Updated', exercises: [] } as any,
        });
      });

      expect(mockUpdateWorkout).toHaveBeenCalledWith('session-1', { name: 'Updated', exercises: [] });
      expect(mockSyncCache).toHaveBeenCalledWith(queryClient, responseData);
    });
  });

  describe('useCreateExerciseEntry', () => {
    it('calls createExerciseEntry API', async () => {
      const payload = {
        exercise_id: 'ex-1',
        duration_minutes: 30,
        calories_burned: 300,
        entry_date: '2026-03-20',
      };
      mockCreateExerciseEntry.mockResolvedValue({ id: 'entry-1' });

      const { result } = renderHook(() => useCreateExerciseEntry(), { wrapper });

      await act(async () => {
        await result.current.createEntry(payload as any);
      });

      expect(mockCreateExerciseEntry).toHaveBeenCalledWith(payload);
    });
  });

  describe('useUpdateExerciseEntry', () => {
    it('calls updateExerciseEntry API', async () => {
      const payload = {
        exercise_id: 'ex-1',
        duration_minutes: 45,
        calories_burned: 400,
        entry_date: '2026-03-20',
      };
      mockUpdateExerciseEntry.mockResolvedValue({ id: 'entry-1' });

      const { result } = renderHook(() => useUpdateExerciseEntry(), { wrapper });

      await act(async () => {
        await result.current.updateEntry({ id: 'entry-1', payload } as any);
      });

      expect(mockUpdateExerciseEntry).toHaveBeenCalledWith('entry-1', payload);
    });
  });

  describe('useDeleteWorkout', () => {
    it('shows confirmation dialog on confirmAndDelete', () => {
      const { result } = renderHook(
        () => useDeleteWorkout({ sessionId: 'session-1', entryDate: '2026-03-20' }),
        { wrapper },
      );

      act(() => {
        result.current.confirmAndDelete();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete Workout?',
        'This workout and all its exercises will be permanently removed.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({ text: 'Delete', style: 'destructive' }),
        ]),
      );
    });

    it('calls deleteWorkout API and fires onSuccess when user confirms', async () => {
      mockDeleteWorkout.mockResolvedValue(undefined);

      const onSuccess = jest.fn();
      const { result } = renderHook(
        () => useDeleteWorkout({ sessionId: 'session-1', entryDate: '2026-03-20', onSuccess }),
        { wrapper },
      );

      act(() => {
        result.current.confirmAndDelete();
      });

      // Extract the Delete button's onPress from the Alert.alert mock call
      const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const deleteButton = alertButtons.find((b: any) => b.text === 'Delete');

      await act(async () => {
        deleteButton.onPress();
      });

      await waitFor(() => {
        expect(mockDeleteWorkout).toHaveBeenCalledWith('session-1');
        expect(onSuccess).toHaveBeenCalled();
        expect(mockInvalidateCache).toHaveBeenCalledWith(queryClient, '2026-03-20');
      });
    });

    it('invalidateCache calls invalidateExerciseCache with normalized date', async () => {
      const { result } = renderHook(
        () => useDeleteWorkout({ sessionId: 'session-1', entryDate: '2026-03-20' }),
        { wrapper },
      );

      await act(async () => {
        result.current.invalidateCache();
      });

      expect(mockInvalidateCache).toHaveBeenCalledWith(queryClient, '2026-03-20');
    });
  });

  describe('useDeleteExerciseEntry', () => {
    it('shows confirmation dialog with activity-specific text', () => {
      const { result } = renderHook(
        () => useDeleteExerciseEntry({ entryId: 'entry-1', entryDate: '2026-03-20' }),
        { wrapper },
      );

      act(() => {
        result.current.confirmAndDelete();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete Activity?',
        'This activity will be permanently removed.',
        expect.any(Array),
      );
    });

    it('calls deleteExerciseEntry API and fires onSuccess when user confirms', async () => {
      mockDeleteExerciseEntry.mockResolvedValue(undefined);

      const onSuccess = jest.fn();
      const { result } = renderHook(
        () => useDeleteExerciseEntry({ entryId: 'entry-1', entryDate: '2026-03-20', onSuccess }),
        { wrapper },
      );

      act(() => {
        result.current.confirmAndDelete();
      });

      const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const deleteButton = alertButtons.find((b: any) => b.text === 'Delete');

      await act(async () => {
        deleteButton.onPress();
      });

      await waitFor(() => {
        expect(mockDeleteExerciseEntry).toHaveBeenCalledWith('entry-1');
        expect(onSuccess).toHaveBeenCalled();
        expect(mockInvalidateCache).toHaveBeenCalledWith(queryClient, '2026-03-20');
      });
    });
  });

  describe('useCreateExercise', () => {
    it('invalidates suggested, count, library, and search caches on success', async () => {
      mockCreateExercise.mockResolvedValue({ id: 'ex-1', name: 'Test' });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const resetSpy = jest.spyOn(queryClient, 'resetQueries');

      const { result } = renderHook(() => useCreateExercise(), { wrapper });

      await act(async () => {
        await result.current.createExerciseAsync({ name: 'Test', category: 'general', description: null });
      });

      const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
      expect(invalidatedKeys).toEqual(
        expect.arrayContaining([
          ['suggestedExercises'],
          ['exercises', 'count'],
          ['exerciseSearch'],
        ]),
      );
      const resetKeys = resetSpy.mock.calls.map((call) => call[0]?.queryKey);
      expect(resetKeys).toEqual(expect.arrayContaining([['exercisesLibrary']]));
    });
  });

  describe('useUpdateExercise', () => {
    it('calls updateExercise and invalidates library caches on success', async () => {
      mockUpdateExercise.mockResolvedValue({ id: 'ex-1', name: 'Updated' });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateExercise(), { wrapper });

      await act(async () => {
        await result.current.updateExerciseAsync({
          id: 'ex-1',
          payload: { name: 'Updated' },
        });
      });

      expect(mockUpdateExercise).toHaveBeenCalledWith('ex-1', { name: 'Updated' });
      const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
      expect(invalidatedKeys).toEqual(
        expect.arrayContaining([
          ['suggestedExercises'],
          ['exercises', 'count'],
          ['exerciseSearch'],
        ]),
      );
    });

    it('shows permission toast on 403', async () => {
      mockUpdateExercise.mockRejectedValue(new Error('Server error: 403 - Forbidden'));

      const { result } = renderHook(() => useUpdateExercise(), { wrapper });

      await act(async () => {
        try {
          await result.current.updateExerciseAsync({ id: 'ex-1', payload: { name: 'X' } });
        } catch {
          // expected
        }
      });

      await waitFor(() => {
        expect(Toast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Failed to update exercise',
          text2: "You don't have permission to edit this exercise.",
        });
      });
    });

    it('shows permission toast on 404', async () => {
      mockUpdateExercise.mockRejectedValue(new Error('Server error: 404 - not authorized'));

      const { result } = renderHook(() => useUpdateExercise(), { wrapper });

      await act(async () => {
        try {
          await result.current.updateExerciseAsync({ id: 'ex-1', payload: { name: 'X' } });
        } catch {
          // expected
        }
      });

      await waitFor(() => {
        expect(Toast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text2: "You don't have permission to edit this exercise.",
          }),
        );
      });
    });
  });

  describe('useDeleteExerciseLibrary', () => {
    it('shows confirmation dialog with exercise-specific text', () => {
      const { result } = renderHook(
        () => useDeleteExerciseLibrary({ exerciseId: 'ex-1' }),
        { wrapper },
      );

      act(() => {
        result.current.confirmAndDelete();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete Exercise?',
        expect.stringContaining('removed from your library'),
        expect.any(Array),
      );
    });

    it('calls deleteExerciseFromLibrary and fires onSuccess on confirm', async () => {
      mockDeleteExerciseFromLibrary.mockResolvedValue(undefined);
      const onSuccess = jest.fn();

      const { result } = renderHook(
        () => useDeleteExerciseLibrary({ exerciseId: 'ex-1', onSuccess }),
        { wrapper },
      );

      act(() => {
        result.current.confirmAndDelete();
      });

      const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const deleteButton = alertButtons.find((b: any) => b.text === 'Delete');

      await act(async () => {
        deleteButton.onPress();
      });

      await waitFor(() => {
        expect(mockDeleteExerciseFromLibrary).toHaveBeenCalledWith('ex-1');
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('shows permission toast on 403', async () => {
      mockDeleteExerciseFromLibrary.mockRejectedValue(
        new Error('Server error: 403 - Forbidden'),
      );

      const { result } = renderHook(
        () => useDeleteExerciseLibrary({ exerciseId: 'ex-1' }),
        { wrapper },
      );

      act(() => {
        result.current.confirmAndDelete();
      });

      const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const deleteButton = alertButtons.find((b: any) => b.text === 'Delete');

      await act(async () => {
        deleteButton.onPress();
      });

      await waitFor(() => {
        expect(Toast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Failed to delete exercise',
          text2: "You don't have permission to delete this exercise.",
        });
      });
    });
  });
});
