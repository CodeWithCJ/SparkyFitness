import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SettingsScreen from '../../src/screens/SettingsScreen';
import {
  usePreferences,
  useServerConfigs,
  useServerConnection,
} from '../../src/hooks';

type ScreenProps = React.ComponentProps<typeof SettingsScreen>;

const navigation = {
  navigate: jest.fn(),
} as unknown as ScreenProps['navigation'];
const route = {
  key: 'Settings-1',
  name: 'Settings',
  params: undefined,
} as unknown as ScreenProps['route'];

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => false),
    isPaired: jest.fn(() => false),
    isGarminAvailable: jest.fn(() => true),
  },
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useFocusEffect: (callback: () => void) => callback() };
});

jest.mock('../../src/hooks/useCoaches', () => ({
  useCoachesAvailable: () => false,
}));
jest.mock('../../src/hooks', () => ({
  useServerConnection: jest.fn(),
  useServerConfigs: jest.fn(),
  usePreferences: jest.fn(),
  queryClient: { getQueryCache: () => ({ getAll: () => [] }) },
}));

jest.mock('../../src/hooks/useNfcSupport', () => ({
  useNfcSupport: () => ({
    supported: false,
    enabled: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('../../src/hooks/useDiscreetMode', () => ({
  useDiscreetMode: () => ({ discreetMode: false }),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: () => false,
}));

jest.mock('../../src/services/storage', () => ({
  loadLastSyncedTime: jest.fn().mockResolvedValue(null),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

const watch = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: {
      isSupported: jest.Mock;
      isPaired: jest.Mock;
      isGarminAvailable?: jest.Mock;
      setGarminSimulator?: jest.Mock;
    };
  }
).default;
const isGarminAvailable = watch.isGarminAvailable as jest.Mock;
const globals = globalThis as unknown as { __DEV__: boolean };
const originalOs = Platform.OS;
const originalDev = globals.__DEV__;

const renderScreen = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <SettingsScreen navigation={navigation} route={route} />
    </SafeAreaProvider>
  );

// The real `isGarminWatchEnabled`, on an Android development build unless a
// test says otherwise.
describe('SettingsScreen Garmin row', () => {
  afterEach(() => {
    Platform.OS = originalOs;
    globals.__DEV__ = originalDev;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    globals.__DEV__ = true;
    watch.isGarminAvailable = isGarminAvailable;
    isGarminAvailable.mockReturnValue(true);
    (useServerConnection as jest.Mock).mockReturnValue({ isConnected: true });
    (useServerConfigs as jest.Mock).mockReturnValue({ activeConfig: null });
    (usePreferences as jest.Mock).mockReturnValue({ preferences: null });
  });

  test('opens Settings → Garmin when Garmin Connect is installed', () => {
    const { getByText, queryByText } = renderScreen();

    fireEvent.press(getByText('settings.rows.garmin'));

    expect(navigation.navigate).toHaveBeenCalledWith('GarminSettings');
    // No Wear OS watch here, so only the Garmin row shows.
    expect(queryByText('settings.rows.wearOs')).toBeNull();
    expect(queryByText('settings.rows.watch')).toBeNull();
  });

  test('is hidden in a release build until the watch app is on the Connect IQ Store', () => {
    globals.__DEV__ = false;

    expect(renderScreen().queryByText('settings.rows.garmin')).toBeNull();
  });

  test('is hidden on iOS, whatever the module says', () => {
    Platform.OS = 'ios';

    expect(renderScreen().queryByText('settings.rows.garmin')).toBeNull();
  });

  test('is hidden without Garmin Connect', () => {
    isGarminAvailable.mockReturnValue(false);

    expect(renderScreen().queryByText('settings.rows.garmin')).toBeNull();
  });

  test('is hidden on a module without Garmin', () => {
    delete watch.isGarminAvailable;

    expect(renderScreen().queryByText('settings.rows.garmin')).toBeNull();
  });

  describe('with the development simulator switch', () => {
    beforeEach(() => {
      watch.setGarminSimulator = jest.fn();
    });

    afterEach(() => {
      delete watch.setGarminSimulator;
    });

    test('shows the row without Garmin Connect, so the switch can be reached', () => {
      isGarminAvailable.mockReturnValue(false);

      fireEvent.press(renderScreen().getByText('settings.rows.garmin'));

      expect(navigation.navigate).toHaveBeenCalledWith('GarminSettings');
    });

    test('never in a release build or on iOS', () => {
      isGarminAvailable.mockReturnValue(false);
      globals.__DEV__ = false;
      expect(renderScreen().queryByText('settings.rows.garmin')).toBeNull();

      globals.__DEV__ = true;
      Platform.OS = 'ios';
      expect(renderScreen().queryByText('settings.rows.garmin')).toBeNull();
    });
  });
});
