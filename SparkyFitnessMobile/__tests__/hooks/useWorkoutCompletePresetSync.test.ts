import { Alert, AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useWorkoutCompletePresetSync } from '../../src/hooks/useWorkoutCompletePresetSync';
import { getWorkoutPresetById } from '../../src/services/api/workoutPresetsApi';
import { getActiveServerConfig } from '../../src/services/storage';
import { buildPresetUpdateExercises } from '../../src/utils/workoutSession';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { id: 'user-1' } }),
}));
const mockUpdatePresetAsync = jest.fn();
jest.mock('../../src/hooks/useWorkoutPresetMutations', () => ({
  useUpdateWorkoutPreset: () => ({ updatePresetAsync: mockUpdatePresetAsync }),
}));
jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  getWorkoutPresetById: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));
jest.mock('../../src/utils/workoutSession', () => ({
  buildPresetUpdateExercises: jest.fn(),
}));

const session = { exercises: [] } as unknown as PresetSessionResponse;

function args(onSettled: () => void, sourcePresetId: number | null = 5) {
  return {
    session,
    sourcePresetId,
    sourceServerConfigId: 'srv',
    completedSetIds: {},
    plannedSetValues: {},
    onSettled,
  };
}

describe('useWorkoutCompletePresetSync onSettled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePresetAsync.mockResolvedValue(undefined);
    (getActiveServerConfig as jest.Mock).mockResolvedValue({ id: 'srv' });
    (getWorkoutPresetById as jest.Mock).mockResolvedValue({
      id: 5,
      user_id: 'user-1',
      name: 'Push',
      exercises: [],
    });
  });

  it('settles at once when the workout was not from a preset', () => {
    const onSettled = jest.fn();
    renderHook(() => useWorkoutCompletePresetSync(args(onSettled, null)));
    expect(onSettled).toHaveBeenCalled();
  });

  it('settles without asking when nothing structural changed', async () => {
    (buildPresetUpdateExercises as jest.Mock).mockReturnValue(null);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSettled = jest.fn();
    renderHook(() => useWorkoutCompletePresetSync(args(onSettled)));
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
    expect(alert).not.toHaveBeenCalled();
  });

  it('settles when the lifter answers the prompt', async () => {
    (buildPresetUpdateExercises as jest.Mock).mockReturnValue([{}]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSettled = jest.fn();
    renderHook(() => useWorkoutCompletePresetSync(args(onSettled)));
    await waitFor(() => expect(getWorkoutPresetById).toHaveBeenCalled());
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(onSettled).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2]!;
    act(() => buttons[0]!.onPress?.());
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('settles after the preset update succeeds', async () => {
    (buildPresetUpdateExercises as jest.Mock).mockReturnValue([{}]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSettled = jest.fn();
    renderHook(() => useWorkoutCompletePresetSync(args(onSettled)));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => {
      buttons[1]!.onPress?.();
    });
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it('asks again instead of settling when the preset update fails', async () => {
    (buildPresetUpdateExercises as jest.Mock).mockReturnValue([{}]);
    mockUpdatePresetAsync.mockRejectedValue(new Error('offline'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSettled = jest.fn();
    renderHook(() => useWorkoutCompletePresetSync(args(onSettled)));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => {
      buttons[1]!.onPress?.();
    });
    await waitFor(() => expect(mockUpdatePresetAsync).toHaveBeenCalled());
    expect(onSettled).not.toHaveBeenCalled();
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
  });

  it('settles when the preset cannot be loaded', async () => {
    (getWorkoutPresetById as jest.Mock).mockRejectedValue(new Error('404'));
    const onSettled = jest.fn();
    renderHook(() => useWorkoutCompletePresetSync(args(onSettled)));
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
  });

  it('says a preset needs updating before the prompt is shown', async () => {
    (buildPresetUpdateExercises as jest.Mock).mockReturnValue([{}]);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onNeedsUpdate = jest.fn();
    renderHook(() =>
      useWorkoutCompletePresetSync({ ...args(jest.fn()), onNeedsUpdate })
    );
    await waitFor(() =>
      expect(onNeedsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ presetName: 'Push' })
      )
    );
    expect(onNeedsUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not say so when nothing needs updating', async () => {
    (buildPresetUpdateExercises as jest.Mock).mockReturnValue(null);
    const onNeedsUpdate = jest.fn();
    const onSettled = jest.fn();
    renderHook(() =>
      useWorkoutCompletePresetSync({ ...args(onSettled), onNeedsUpdate })
    );
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
    expect(onNeedsUpdate).not.toHaveBeenCalled();
  });

  it('holds the prompt until the app is in front', async () => {
    (buildPresetUpdateExercises as jest.Mock).mockReturnValue([{}]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    Object.defineProperty(AppState, 'currentState', {
      value: 'background',
      configurable: true,
    });
    let onChange: ((state: string) => void) | undefined;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, handler) => {
        onChange = handler as (state: string) => void;
        return { remove: jest.fn() } as never;
      });
    const onNeedsUpdate = jest.fn();
    renderHook(() =>
      useWorkoutCompletePresetSync({ ...args(jest.fn()), onNeedsUpdate })
    );
    await waitFor(() => expect(onNeedsUpdate).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(alert).not.toHaveBeenCalled();

    act(() => onChange?.('active'));
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
  });

  it('asks again when the watch starts waiting after the alert opened and then never answers', async () => {
    jest.restoreAllMocks();
    Object.defineProperty(AppState, 'currentState', {
      value: 'active',
      configurable: true,
    });
    (buildPresetUpdateExercises as jest.Mock).mockReturnValue([{}]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSettled = jest.fn();
    const { rerender } = renderHook(
      ({ skipPrompt }: { skipPrompt: boolean }) =>
        useWorkoutCompletePresetSync({ ...args(onSettled), skipPrompt }),
      { initialProps: { skipPrompt: false } }
    );
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    rerender({ skipPrompt: true });
    const buttons = alert.mock.calls[0]![2]!;
    act(() => buttons[0]!.onPress?.());
    expect(onSettled).not.toHaveBeenCalled();
    rerender({ skipPrompt: false });
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
  });
});
