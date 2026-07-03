import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  useCreateWorkoutPreset,
  useUpdateWorkoutPreset,
  useDeleteWorkoutPreset,
} from '../../src/hooks/useWorkoutPresetMutations';
import {
  createWorkoutPreset,
  updateWorkoutPreset,
  deleteWorkoutPreset,
} from '../../src/services/api/workoutPresetsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  createWorkoutPreset: jest.fn(),
  updateWorkoutPreset: jest.fn(),
  deleteWorkoutPreset: jest.fn(),
}));

const mockCreate = createWorkoutPreset as jest.MockedFunction<typeof createWorkoutPreset>;
const mockUpdate = updateWorkoutPreset as jest.MockedFunction<typeof updateWorkoutPreset>;
const mockDelete = deleteWorkoutPreset as jest.MockedFunction<typeof deleteWorkoutPreset>;

const createBody = { name: 'Push Day', exercises: [] } as never;

describe('useWorkoutPresetMutations', () => {
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
    jest.restoreAllMocks();
  });

  /** The five caches `invalidateWorkoutPresetCaches` touches. */
  function expectCachesInvalidated(
    invalidateSpy: jest.SpyInstance,
    resetSpy: jest.SpyInstance,
  ): void {
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ['workoutPresets'],
        ['workoutPresets', 'count'],
        ['workoutPresetsLibrary'],
        ['workoutPresetSearch'],
      ]),
    );
    const resetKeys = resetSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(resetKeys).toEqual(expect.arrayContaining([['workoutPresetsLibraryList']]));
  }

  describe('useCreateWorkoutPreset', () => {
    it('creates the preset and invalidates caches on success', async () => {
      mockCreate.mockResolvedValue({ id: 'p1' } as never);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const resetSpy = jest.spyOn(queryClient, 'resetQueries');

      const { result } = renderHook(() => useCreateWorkoutPreset(), { wrapper });

      await act(async () => {
        await result.current.createPresetAsync(createBody);
      });

      expect(mockCreate).toHaveBeenCalledWith(createBody);
      expectCachesInvalidated(invalidateSpy, resetSpy);
    });

    it('shows an error toast when creation fails', async () => {
      mockCreate.mockRejectedValue(new Error('network'));

      const { result } = renderHook(() => useCreateWorkoutPreset(), { wrapper });

      await act(async () => {
        await expect(result.current.createPresetAsync(createBody)).rejects.toThrow('network');
      });

      await waitFor(() => {
        expect(Toast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Could not create workout preset',
          text2: 'Please try again.',
        });
      });
    });
  });

  describe('useUpdateWorkoutPreset', () => {
    it('updates the preset and invalidates caches on success', async () => {
      mockUpdate.mockResolvedValue({ id: 'p1', name: 'Updated' } as never);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const resetSpy = jest.spyOn(queryClient, 'resetQueries');

      const { result } = renderHook(() => useUpdateWorkoutPreset(), { wrapper });

      const payload = { name: 'Updated', exercises: [] } as never;
      await act(async () => {
        await result.current.updatePresetAsync({ id: 'p1', payload });
      });

      expect(mockUpdate).toHaveBeenCalledWith('p1', payload);
      expectCachesInvalidated(invalidateSpy, resetSpy);
    });

    it('shows a permission toast on a 403 error', async () => {
      mockUpdate.mockRejectedValue(new Error('Request failed: 403 Forbidden'));

      const { result } = renderHook(() => useUpdateWorkoutPreset(), { wrapper });

      await act(async () => {
        await expect(
          result.current.updatePresetAsync({ id: 'p1', payload: {} as never }),
        ).rejects.toThrow();
      });

      await waitFor(() => {
        expect(Toast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Failed to update preset',
          text2: "You don't have permission to edit this preset.",
        });
      });
    });

    it('shows a generic toast on a non-authz error', async () => {
      mockUpdate.mockRejectedValue(new Error('500 Server Error'));

      const { result } = renderHook(() => useUpdateWorkoutPreset(), { wrapper });

      await act(async () => {
        await expect(
          result.current.updatePresetAsync({ id: 'p1', payload: {} as never }),
        ).rejects.toThrow();
      });

      await waitFor(() => {
        expect(Toast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Failed to update preset',
          text2: 'Please try again.',
        });
      });
    });
  });

  describe('useDeleteWorkoutPreset', () => {
    it('confirmAndDelete shows a destructive confirmation alert', () => {
      const { result } = renderHook(
        () => useDeleteWorkoutPreset({ presetId: 'p1' }),
        { wrapper },
      );

      act(() => result.current.confirmAndDelete());

      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete Workout Preset?',
        expect.stringContaining('permanently removed'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({ text: 'Delete', style: 'destructive' }),
        ]),
      );
    });

    it('deletes, invalidates caches, and fires onSuccess when confirmed', async () => {
      mockDelete.mockResolvedValue(undefined as never);
      const onSuccess = jest.fn();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const resetSpy = jest.spyOn(queryClient, 'resetQueries');

      const { result } = renderHook(
        () => useDeleteWorkoutPreset({ presetId: 'p1', onSuccess }),
        { wrapper },
      );

      act(() => result.current.confirmAndDelete());

      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const deleteButton = buttons.find((b: { text: string }) => b.text === 'Delete');
      await act(async () => {
        deleteButton.onPress();
      });

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('p1');
        expect(onSuccess).toHaveBeenCalled();
      });
      expectCachesInvalidated(invalidateSpy, resetSpy);
    });

    it('deletes successfully without an onSuccess callback', async () => {
      mockDelete.mockResolvedValue(undefined as never);

      const { result } = renderHook(
        () => useDeleteWorkoutPreset({ presetId: 'p1' }),
        { wrapper },
      );

      act(() => result.current.confirmAndDelete());

      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const deleteButton = buttons.find((b: { text: string }) => b.text === 'Delete');
      await act(async () => {
        deleteButton.onPress();
      });

      // The optional `onSuccess?.()` chain must not throw when omitted.
      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('p1');
      });
      expect(Toast.show).not.toHaveBeenCalled();
    });

    it('shows a permission toast on a 404 error', async () => {
      mockDelete.mockRejectedValue(new Error('404 Not Found'));

      const { result } = renderHook(
        () => useDeleteWorkoutPreset({ presetId: 'p1' }),
        { wrapper },
      );

      act(() => result.current.confirmAndDelete());

      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const deleteButton = buttons.find((b: { text: string }) => b.text === 'Delete');
      await act(async () => {
        deleteButton.onPress();
      });

      await waitFor(() => {
        expect(Toast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Failed to delete preset',
          text2: "You don't have permission to delete this preset.",
        });
      });
    });
  });
});
