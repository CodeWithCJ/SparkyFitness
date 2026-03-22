import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useStartExercise } from '../../src/hooks/useStartExercise';

jest.mock('../../src/services/workoutDraftService', () => ({
  loadActiveDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

const { loadActiveDraft: mockLoadActiveDraft, clearDraft: mockClearDraft } = jest.requireMock(
  '../../src/services/workoutDraftService',
);

// Mock queryClient used directly by the hook
jest.mock('../../src/hooks/queryClient', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});

const { queryClient: mockQueryClient } = jest.requireMock('../../src/hooks/queryClient');

jest.mock('../../src/hooks/queryKeys', () => ({
  serverConnectionQueryKey: ['serverConnection'],
}));

describe('useStartExercise', () => {
  const mockNavigate = jest.fn();
  const navigation = { navigate: mockNavigate };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockQueryClient.clear();
  });

  it('shows "No Server Connected" alert when not connected', async () => {
    // No server connection in cache
    const { result } = renderHook(() =>
      useStartExercise({ navigation }),
    );

    await act(async () => {
      await result.current();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'No Server Connected',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Go to Settings' }),
      ]),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to Settings when user taps "Go to Settings"', async () => {
    const { result } = renderHook(() =>
      useStartExercise({ navigation }),
    );

    await act(async () => {
      await result.current();
    });

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const settingsButton = alertButtons.find((b: any) => b.text === 'Go to Settings');
    settingsButton.onPress();

    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Settings' });
  });

  it('shows draft alert when connected and draft exists', async () => {
    // Set server connection as truthy
    mockQueryClient.setQueryData(['serverConnection'], true);
    mockLoadActiveDraft.mockResolvedValue({
      type: 'workout',
      name: 'Push Day',
      exercises: [{ clientId: 'ex-1' }],
    });

    const { result } = renderHook(() =>
      useStartExercise({ navigation }),
    );

    await act(async () => {
      await result.current();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Draft in Progress',
      expect.stringContaining('workout'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Resume Draft' }),
        expect.objectContaining({ text: 'Discard & Continue' }),
      ]),
    );
  });

  it('navigates to WorkoutForm when user resumes a workout draft', async () => {
    mockQueryClient.setQueryData(['serverConnection'], true);
    mockLoadActiveDraft.mockResolvedValue({
      type: 'workout',
      name: 'Push Day',
      exercises: [{ clientId: 'ex-1' }],
    });

    const { result } = renderHook(() =>
      useStartExercise({ navigation }),
    );

    await act(async () => {
      await result.current();
    });

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const resumeButton = alertButtons.find((b: any) => b.text === 'Resume Draft');
    resumeButton.onPress();

    expect(mockNavigate).toHaveBeenCalledWith('WorkoutForm');
  });

  it('navigates to ActivityForm when user resumes an activity draft', async () => {
    mockQueryClient.setQueryData(['serverConnection'], true);
    mockLoadActiveDraft.mockResolvedValue({
      type: 'activity',
      exerciseId: 'ex-1',
    });

    const { result } = renderHook(() =>
      useStartExercise({ navigation }),
    );

    await act(async () => {
      await result.current();
    });

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const resumeButton = alertButtons.find((b: any) => b.text === 'Resume Draft');
    resumeButton.onPress();

    expect(mockNavigate).toHaveBeenCalledWith('ActivityForm');
  });

  it('clears draft and navigates to ExerciseSearch when user discards', async () => {
    mockQueryClient.setQueryData(['serverConnection'], true);
    mockClearDraft.mockResolvedValue(undefined);
    mockLoadActiveDraft.mockResolvedValue({
      type: 'workout',
      name: 'Old Workout',
      exercises: [{ clientId: 'ex-1' }],
    });

    const getDate = () => '2026-03-20';
    const { result } = renderHook(() =>
      useStartExercise({ navigation, getDate, entryTarget: 'activity' }),
    );

    await act(async () => {
      await result.current();
    });

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const discardButton = alertButtons.find((b: any) => b.text === 'Discard & Continue');

    await act(async () => {
      await discardButton.onPress();
    });

    expect(mockClearDraft).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('ExerciseSearch', {
      mode: 'entry',
      date: '2026-03-20',
      entryTarget: 'activity',
    });
  });

  it('navigates directly to ExerciseSearch when connected and no draft', async () => {
    mockQueryClient.setQueryData(['serverConnection'], true);
    mockLoadActiveDraft.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useStartExercise({ navigation }),
    );

    await act(async () => {
      await result.current();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('ExerciseSearch', {
      mode: 'entry',
      date: undefined,
      entryTarget: undefined,
    });
  });

  it('passes date and entryTarget to ExerciseSearch', async () => {
    mockQueryClient.setQueryData(['serverConnection'], true);
    mockLoadActiveDraft.mockResolvedValue(null);

    const getDate = () => '2026-03-20';
    const { result } = renderHook(() =>
      useStartExercise({ navigation, getDate, entryTarget: 'workout' }),
    );

    await act(async () => {
      await result.current();
    });

    expect(mockNavigate).toHaveBeenCalledWith('ExerciseSearch', {
      mode: 'entry',
      date: '2026-03-20',
      entryTarget: 'workout',
    });
  });
});
