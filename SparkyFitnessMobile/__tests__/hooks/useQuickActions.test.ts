import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as QuickActions from 'expo-quick-actions';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  drainQuickActionNavigation,
  quickActionItems,
  runQuickAction,
  useQuickActions,
} from '../../src/hooks/useQuickActions';
import {
  changeWaterIntake,
  fetchWaterContainers,
} from '../../src/services/api/measurementsApi';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';
import { DEFAULT_WATER_CONTAINER_ID } from '../../src/hooks/useWaterIntakeMutation';
import { refreshBackgroundWaterShortcut } from '../../src/services/backgroundWater';

jest.mock('expo-quick-actions', () => ({
  setItems: jest.fn(() => Promise.resolve()),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  initial: undefined,
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/services/api/measurementsApi', () => ({
  changeWaterIntake: jest.fn(),
  fetchWaterContainers: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));
jest.mock('../../src/services/backgroundWater', () => ({
  refreshBackgroundWaterShortcut: jest.fn(() => Promise.resolve()),
}));

const originalOS = Platform.OS;
const setPlatform = (os: string) =>
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

describe('quickActionItems', () => {
  afterEach(() => setPlatform(originalOS));

  it('gives every shortcut a readable title', () => {
    setPlatform('ios');
    const titles = quickActionItems().map((item) => item.title);
    expect(titles).toEqual(['Scan food', 'Log food', 'Log water', 'Fasting']);
  });

  it('leaves Log water to the native shortcut on Android', () => {
    setPlatform('android');
    expect(quickActionItems()).toEqual([
      { id: 'scan-food', title: 'Scan food', icon: 'ic_shortcut_scan_food' },
      {
        id: 'search-food',
        title: 'Log food',
        icon: 'ic_shortcut_search_food',
      },
      { id: 'fasting', title: 'Fasting', icon: 'ic_shortcut_fasting' },
    ]);
  });
});

describe('runQuickAction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the scanner, search and fasting screens', () => {
    runQuickAction('scan-food');
    runQuickAction('search-food');
    runQuickAction('fasting');
    expect(navigationRef.navigate).toHaveBeenNthCalledWith(1, 'FoodScan');
    expect(navigationRef.navigate).toHaveBeenNthCalledWith(2, 'FoodSearch');
    expect(navigationRef.navigate).toHaveBeenNthCalledWith(3, 'FastingDetail');
  });

  it('logs one drink of the primary container', async () => {
    (fetchWaterContainers as jest.Mock).mockResolvedValue([
      { id: 1, is_primary: false },
      { id: 2, is_primary: true },
    ]);
    runQuickAction('log-water');
    await waitFor(() =>
      expect(changeWaterIntake).toHaveBeenCalledWith(
        expect.objectContaining({ changeDrinks: 1, containerId: 2 })
      )
    );
  });

  it('logs one drink of the fallback container when none are saved', async () => {
    (fetchWaterContainers as jest.Mock).mockResolvedValue([]);
    runQuickAction('log-water');
    await waitFor(() =>
      expect(changeWaterIntake).toHaveBeenCalledWith(
        expect.objectContaining({
          changeDrinks: 1,
          containerId: DEFAULT_WATER_CONTAINER_ID,
        })
      )
    );
  });

  it('shows an error toast when logging water fails', async () => {
    (fetchWaterContainers as jest.Mock).mockRejectedValue(new Error('offline'));
    runQuickAction('log-water');
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Could not log water',
      })
    );
    expect(changeWaterIntake).not.toHaveBeenCalled();
  });

  it('opens a screen once navigation is ready', () => {
    (navigationRef.isReady as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    runQuickAction('scan-food');
    expect(navigationRef.navigate).not.toHaveBeenCalled();
    drainQuickActionNavigation();
    expect(navigationRef.navigate).toHaveBeenCalledWith('FoodScan');
  });

  it('ignores unknown actions', () => {
    runQuickAction('nope');
    expect(navigationRef.navigate).not.toHaveBeenCalled();
  });
});

describe('useQuickActions', () => {
  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    setPlatform(originalOS);
    (QuickActions as { initial?: { id: string } }).initial = undefined;
  });

  it('puts the native Log water shortcut back once registering has finished', async () => {
    setPlatform('android');
    let finishRegistering = () => {};
    (QuickActions.setItems as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRegistering = resolve;
        })
    );

    renderHook(() => useQuickActions(true));

    expect(
      (QuickActions.setItems as jest.Mock).mock.calls[0][0].map(
        (item: { id: string }) => item.id
      )
    ).toEqual(['scan-food', 'search-food', 'fasting']);
    // Registering replaces every dynamic shortcut, so restoring Log water
    // any earlier would be undone by it.
    await act(async () => {
      await Promise.resolve();
    });
    expect(refreshBackgroundWaterShortcut).not.toHaveBeenCalled();

    await act(async () => {
      finishRegistering();
    });
    expect(refreshBackgroundWaterShortcut).toHaveBeenCalledWith(
      'Log water',
      'Log water without opening the app'
    );
  });

  it('still puts Log water back once registering fails', async () => {
    setPlatform('android');
    let failRegistering = () => {};
    (QuickActions.setItems as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          failRegistering = () => reject(new Error('no activity'));
        })
    );

    renderHook(() => useQuickActions(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(refreshBackgroundWaterShortcut).not.toHaveBeenCalled();

    await act(async () => {
      failRegistering();
    });
    expect(refreshBackgroundWaterShortcut).toHaveBeenCalledTimes(1);
  });

  it('runs the shortcut the app was opened with on Android', async () => {
    setPlatform('android');
    (QuickActions as { initial?: { id: string } }).initial = {
      id: 'fasting',
    };

    renderHook(() => useQuickActions(true));

    expect(navigationRef.navigate).toHaveBeenCalledWith('FastingDetail');
  });

  it('ignores a Log water launch action sent to Android by another app', async () => {
    setPlatform('android');
    // MainActivity is exported, so any app can start it with a shortcut
    // intent naming an id the app never registered there.
    (QuickActions as { initial?: { id: string } }).initial = {
      id: 'log-water',
    };

    renderHook(() => useQuickActions(true));
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchWaterContainers).not.toHaveBeenCalled();
    expect(changeWaterIntake).not.toHaveBeenCalled();
  });

  it('runs only the registered actions that arrive while the app is open on Android', async () => {
    setPlatform('android');

    renderHook(() => useQuickActions(true));
    const listener = (QuickActions.addListener as jest.Mock).mock
      .calls[0][0] as (action: { id: string }) => void;

    listener({ id: 'log-water' });
    listener({ id: 'scan-food' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchWaterContainers).not.toHaveBeenCalled();
    expect(changeWaterIntake).not.toHaveBeenCalled();
    expect(navigationRef.navigate).toHaveBeenCalledWith('FoodScan');
  });

  it('logs water from the iOS shortcut tapped while the app is open', async () => {
    setPlatform('ios');
    (fetchWaterContainers as jest.Mock).mockResolvedValue([
      { id: 2, is_primary: true },
    ]);

    renderHook(() => useQuickActions(true));
    const listener = (QuickActions.addListener as jest.Mock).mock
      .calls[0][0] as (action: { id: string }) => void;
    listener({ id: 'log-water' });

    await waitFor(() => expect(changeWaterIntake).toHaveBeenCalledTimes(1));
  });

  it('does not run the launch action again when the app mounts again', () => {
    setPlatform('android');
    (QuickActions as { initial?: { id: string } }).initial = {
      id: 'scan-food',
    };

    // Android can recreate the activity, and with it the app, while the JS
    // runtime and its launch action live on.
    renderHook(() => useQuickActions(true)).unmount();
    renderHook(() => useQuickActions(true));

    expect(navigationRef.navigate).toHaveBeenCalledTimes(1);
  });

  it('leaves the Android launcher alone on iOS', async () => {
    setPlatform('ios');

    renderHook(() => useQuickActions(true));

    await waitFor(() => expect(QuickActions.setItems).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(refreshBackgroundWaterShortcut).not.toHaveBeenCalled();
  });

  it('registers nothing until a server is connected', () => {
    setPlatform('android');

    renderHook(() => useQuickActions(false));

    expect(QuickActions.setItems).not.toHaveBeenCalled();
    expect(refreshBackgroundWaterShortcut).not.toHaveBeenCalled();
  });

  it('logs a launch drink only once when the effect reruns', async () => {
    setPlatform('ios');
    (QuickActions as { initial?: { id: string } }).initial = {
      id: 'log-water',
    };
    (fetchWaterContainers as jest.Mock).mockResolvedValue([
      { id: 2, is_primary: true },
    ]);

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useQuickActions(enabled),
      { initialProps: { enabled: true } }
    );

    await waitFor(() => expect(changeWaterIntake).toHaveBeenCalledTimes(1));

    rerender({ enabled: false });
    rerender({ enabled: true });

    await act(async () => {
      await Promise.resolve();
    });

    expect(changeWaterIntake).toHaveBeenCalledTimes(1);
  });
});
