import React from 'react';
import { ActivityIndicator } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import type {
  GarminStatus,
  WatchConnectivityEvents,
} from '../../modules/watch-connectivity';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    garminStatus: jest.fn(),
    openGarminApp: jest.fn(),
    addListener: jest.fn(),
  },
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: () => ({ isConnected: true }),
}));

jest.mock('../../src/hooks/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ customNutrients: [] }),
}));

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

import GarminSettingsScreen from '../../src/screens/GarminSettingsScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import { addLog } from '../../src/services/LogService';

type StatusListener = WatchConnectivityEvents['onGarminStatusChange'];

const watch = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: {
      garminStatus?: jest.Mock;
      openGarminApp?: jest.Mock;
      addListener: jest.Mock;
    };
  }
).default;
const garminStatus = watch.garminStatus as jest.Mock;
const openGarminApp = watch.openGarminApp as jest.Mock;

let statusListener: StatusListener | null = null;
const removeListener = jest.fn();

const readyStatus: GarminStatus = {
  state: 'ready',
  devices: [
    { id: '101', name: 'fenix 8', connected: true, app: 'installed' },
    { id: '202', name: 'Forerunner', connected: false, app: 'installed' },
    { id: '303', name: 'Venu', connected: true, app: 'notInstalled' },
    { id: '404', name: '', connected: true, app: 'unknown' },
  ],
};

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderScreen = () =>
  render(
    <GarminSettingsScreen
      {...({ navigation, route: { params: undefined } } as never)}
    />
  );

describe('GarminSettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    statusListener = null;
    watch.garminStatus = garminStatus;
    watch.openGarminApp = openGarminApp;
    garminStatus.mockResolvedValue(readyStatus);
    watch.addListener.mockImplementation(
      (event: string, listener: StatusListener) => {
        if (event === 'onGarminStatusChange') statusListener = listener;
        return { remove: removeListener };
      }
    );
  });

  test('shows the link state and each watch with its connection and app', async () => {
    renderScreen();

    expect(await screen.findByText('Connected to Garmin Connect')).toBeTruthy();
    expect(screen.getByText('fenix 8')).toBeTruthy();
    expect(screen.getByText('Forerunner')).toBeTruthy();
    expect(screen.getByText('Venu')).toBeTruthy();
    // A watch Garmin Connect has no name for still gets a label.
    expect(screen.getByText('Garmin watch')).toBeTruthy();
    expect(screen.getAllByText('Connected')).toHaveLength(3);
    expect(screen.getByText('Not connected')).toBeTruthy();
    expect(screen.getAllByText('SparkyFitness installed')).toHaveLength(2);
    expect(screen.getByText('SparkyFitness not installed')).toBeTruthy();
    expect(
      screen.getByText('Not known yet whether SparkyFitness is installed')
    ).toBeTruthy();
  });

  test('offers Open on watch for every connected watch, whatever Garmin Connect says about the app', async () => {
    renderScreen();
    await screen.findByText('fenix 8');

    expect(screen.getByTestId('garmin-open-101')).toBeTruthy();
    expect(screen.queryByTestId('garmin-open-202')).toBeNull();
    // Garmin Connect's 'notInstalled' and 'unknown' are not trusted for a
    // sideloaded app: the open request itself says whether the app is there.
    expect(screen.getByTestId('garmin-open-303')).toBeTruthy();
    expect(screen.getByTestId('garmin-open-404')).toBeTruthy();
  });

  test('a watch the open request finds without the app says so', async () => {
    openGarminApp.mockResolvedValue('notInstalled');
    renderScreen();

    fireEvent.press(await screen.findByTestId('garmin-open-303'));

    expect(openGarminApp).toHaveBeenCalledWith('303');
    expect(
      await screen.findByTestId('garmin-open-result-303')
    ).toHaveTextContent('SparkyFitness is not installed on this watch.');
  });

  test('says how to get the app where it is missing, as it is not in the store yet', async () => {
    renderScreen();
    await screen.findByText('fenix 8');

    expect(
      screen.getByTestId('garmin-not-installed-hint-303')
    ).toHaveTextContent(
      'The watch app is not in the Connect IQ Store yet. For now it is installed by hand: see targets/garmin/README.md in the SparkyFitness repository.'
    );
    expect(screen.queryByTestId('garmin-not-installed-hint-101')).toBeNull();
    expect(screen.queryByTestId('garmin-not-installed-hint-404')).toBeNull();
  });

  test('each Open on watch names its watch for a screen reader', async () => {
    renderScreen();
    await screen.findByText('fenix 8');

    expect(
      screen.getByLabelText('Open SparkyFitness on fenix 8').props.testID
    ).toBe('garmin-open-101');
    // A watch Garmin Connect has no name for gets the same fallback label.
    expect(
      screen.getByLabelText('Open SparkyFitness on Garmin watch').props.testID
    ).toBe('garmin-open-404');
  });

  test('while the watch is asked, the button is busy and shows a spinner', async () => {
    let answer: (result: string) => void = () => {};
    openGarminApp.mockReturnValue(
      new Promise<string>((resolve) => {
        answer = resolve;
      })
    );
    renderScreen();

    fireEvent.press(await screen.findByTestId('garmin-open-101'));

    const button = screen.getByTestId('garmin-open-101');
    expect(button.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true })
    );
    // The spinner replaces this watch's label only (303 and 404 keep their
    // own), and is white, so it needs the accent fill under it to be seen.
    expect(screen.getAllByText('Open on watch')).toHaveLength(2);
    expect(
      screen
        .UNSAFE_getAllByType(ActivityIndicator)
        .map((indicator) => indicator.props.color)
    ).toEqual(['#fff']);
    expect(button.props.className).toContain('bg-accent-primary');

    await act(async () => {
      answer('promptShown');
    });

    expect(
      screen.getByTestId('garmin-open-101').props.accessibilityState
    ).toEqual(expect.objectContaining({ busy: false }));
  });

  test('Open on watch asks the native side and shows the answer', async () => {
    openGarminApp.mockResolvedValue('promptShown');
    renderScreen();

    fireEvent.press(await screen.findByTestId('garmin-open-101'));

    expect(openGarminApp).toHaveBeenCalledWith('101');
    expect(
      await screen.findByText(
        'Check your watch: it is asking to open SparkyFitness.'
      )
    ).toBeTruthy();
  });

  test('an unknown answer or a failure reads as could not reach the watch', async () => {
    openGarminApp.mockResolvedValueOnce('somethingNew');
    renderScreen();

    fireEvent.press(await screen.findByTestId('garmin-open-101'));
    expect(
      await screen.findByText('Could not reach this watch. Try again.')
    ).toBeTruthy();

    openGarminApp.mockRejectedValueOnce(new Error('sdk gone'));
    fireEvent.press(screen.getByTestId('garmin-open-101'));
    await waitFor(() =>
      expect(addLog).toHaveBeenCalledWith(
        'Garmin open app failed: Error: sdk gone',
        'WARNING'
      )
    );
    expect(
      screen.getByText('Could not reach this watch. Try again.')
    ).toBeTruthy();
  });

  test('follows status events after the first answer', async () => {
    renderScreen();
    await screen.findByText('fenix 8');

    act(() => {
      statusListener?.({
        state: 'error',
        error: 'SERVICE_ERROR',
        devices: [],
      });
    });

    expect(screen.getByText("Can't reach Garmin Connect")).toBeTruthy();
    expect(
      screen.getByText(
        'Check that Garmin Connect is installed and signed in. SparkyFitness keeps trying to reach it.'
      )
    ).toBeTruthy();
    // The list is empty because the link is down, not because there is no
    // watch: the link card above says what is wrong.
    expect(screen.queryByTestId('garmin-no-watches')).toBeNull();
    expect(screen.queryByText('Watches')).toBeNull();
    // The native error code is for the logs, not the screen.
    expect(screen.queryByText('SERVICE_ERROR')).toBeNull();
  });

  test.each([
    [
      'garminConnectUpgradeNeeded',
      'Update Garmin Connect from Google Play. SparkyFitness keeps trying to reach it.',
    ],
    [
      'bindTimeout',
      'Garmin Connect is not answering. Open it once, then come back here. SparkyFitness keeps trying to reach it.',
    ],
  ])("the '%s' error gets its own hint", async (error, hint) => {
    garminStatus.mockResolvedValue({ state: 'error', error, devices: [] });
    renderScreen();

    expect(await screen.findByText(hint)).toBeTruthy();
    expect(
      screen.queryByText(
        'Check that Garmin Connect is installed and signed in. SparkyFitness keeps trying to reach it.'
      )
    ).toBeNull();
  });

  test.each([
    [
      'binder',
      'Garmin Connect can wake SparkyFitness to receive from your watch.',
    ],
    [
      'broadcast',
      'Keep SparkyFitness open in the background to receive from your watch.',
    ],
  ] as const)(
    "a ready link with '%s' delivery says what it means",
    async (delivery, note) => {
      garminStatus.mockResolvedValue({ ...readyStatus, delivery });
      renderScreen();

      expect(await screen.findByTestId('garmin-delivery')).toHaveTextContent(
        note
      );
    }
  );

  test('says nothing about delivery without a mode, or while not ready', async () => {
    // A native build from before the binder delivery reports none.
    renderScreen();
    await screen.findByText('fenix 8');
    expect(screen.queryByTestId('garmin-delivery')).toBeNull();

    act(() => {
      statusListener?.({ ...readyStatus, delivery: 'none' });
    });
    expect(screen.queryByTestId('garmin-delivery')).toBeNull();

    // A mode left over from before the link went down is not shown.
    act(() => {
      statusListener?.({ state: 'starting', devices: [], delivery: 'binder' });
    });
    expect(screen.getByText('Connecting to Garmin Connect…')).toBeTruthy();
    expect(screen.queryByTestId('garmin-delivery')).toBeNull();
  });

  test('says no watch was found only once the link is ready', async () => {
    garminStatus.mockResolvedValue({ state: 'starting', devices: [] });
    renderScreen();
    await screen.findByText('Connecting to Garmin Connect…');
    expect(screen.queryByTestId('garmin-no-watches')).toBeNull();

    act(() => {
      statusListener?.({ state: 'ready', devices: [] });
    });

    expect(screen.getByTestId('garmin-no-watches')).toHaveTextContent(
      'No Garmin watch found. Pair your watch in the Garmin Connect app.'
    );
  });

  test('a late first answer does not replace a newer event', async () => {
    let answer: (status: GarminStatus) => void = () => {};
    garminStatus.mockReturnValue(
      new Promise<GarminStatus>((resolve) => {
        answer = resolve;
      })
    );
    renderScreen();

    act(() => {
      statusListener?.(readyStatus);
    });
    await act(async () => {
      answer({ state: 'starting', devices: [] });
    });

    expect(screen.getByText('Connected to Garmin Connect')).toBeTruthy();
    expect(screen.getByText('fenix 8')).toBeTruthy();
  });

  test('shows connecting until the native side answers', () => {
    garminStatus.mockReturnValue(new Promise<GarminStatus>(() => {}));
    renderScreen();

    expect(screen.getByText('Connecting to Garmin Connect…')).toBeTruthy();
  });

  test('a module without Garmin shows Garmin Connect as not available', () => {
    delete watch.garminStatus;
    delete watch.openGarminApp;
    renderScreen();

    expect(screen.getByText('Garmin Connect is not available')).toBeTruthy();
    expect(watch.addListener).not.toHaveBeenCalled();
  });

  test('stops listening when it closes', async () => {
    const { unmount } = renderScreen();
    await screen.findByText('fenix 8');

    unmount();

    expect(removeListener).toHaveBeenCalled();
  });

  test('explains what the Garmin app does and keeping Garmin Connect running', async () => {
    renderScreen();
    await screen.findByText('fenix 8');

    expect(
      screen.getByText(
        "The SparkyFitness app on your Garmin watch shows the Goals page: today's calories and the nutrients chosen below. More pages are coming."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Your phone sends the numbers through Garmin Connect, so keep Garmin Connect allowed to run in the background.'
      )
    ).toBeTruthy();
  });

  test('edits the same Goals page nutrients as the other watch settings', async () => {
    renderScreen();
    await screen.findByText('fenix 8');

    expect(screen.getByText('Goals page nutrients')).toBeTruthy();
    expect(
      screen.getByTestId('watch-nutrient-switch-protein').props.value
    ).toBe(true);

    fireEvent(
      screen.getByTestId('watch-nutrient-switch-sodium'),
      'valueChange',
      true
    );

    expect(useAppPreferencesStore.getState().shownWatchNutrients).toContain(
      'sodium'
    );
  });
});
