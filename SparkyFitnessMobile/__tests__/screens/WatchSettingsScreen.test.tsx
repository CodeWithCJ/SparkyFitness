import React from 'react';
import { Alert, Platform } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import WatchSettingsScreen from '../../src/screens/WatchSettingsScreen';
import WatchConnectivity from '../../modules/watch-connectivity';
import { WATCH_PAGE_KEYS } from '../../src/constants/watchPages';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    isMediaAccessEnabled: jest.fn(async () => false),
    openMediaAccessSettings: jest.fn(async () => undefined),
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
  useCustomNutrients: () => ({
    customNutrients: [{ id: '1', name: 'Creatine', unit: 'g' }],
  }),
}));

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

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderScreen = () =>
  render(
    <WatchSettingsScreen
      {...({ navigation, route: { params: {} } } as never)}
    />
  );

const orderedRowKeys = (): string[] =>
  screen
    .queryAllByTestId(/^watch-page-row-/)
    .map((row) => String(row.props.testID).replace('watch-page-row-', ''));

describe('WatchSettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
  });

  test('lists every watch page in the saved order, adding ones it lacks', () => {
    useAppPreferencesStore.setState({ watchPageOrder: ['workout', 'goals'] });

    renderScreen();

    expect(orderedRowKeys()).toEqual([
      'workout',
      'goals',
      'water',
      'medications',
      'entry',
      'trend',
      'fasting',
      'steps',
    ]);
    expect(orderedRowKeys()).toHaveLength(WATCH_PAGE_KEYS.length);
  });

  test('double-tap to log a set is on by default and can be turned off', () => {
    renderScreen();

    expect(useAppPreferencesStore.getState().watchDoubleTapEnabled).toBe(true);
    const row = screen.getByText('Double-tap to log a set');
    expect(row).toBeTruthy();

    const toggle = screen.getByTestId('watch-double-tap-switch');
    fireEvent(toggle, 'valueChange', false);
    expect(useAppPreferencesStore.getState().watchDoubleTapEnabled).toBe(false);
  });

  test('the layout switches default to the original layout and can be flipped', () => {
    renderScreen();
    const prefs = () => useAppPreferencesStore.getState();

    expect(prefs().watchSetScreenMetrics).toBe(true);
    expect(prefs().watchUpNextPage).toBe(false);
    expect(prefs().watchNewWorkout).toBe(false);
    expect(prefs().watchLargerText).toBe(false);

    fireEvent(
      screen.getByTestId('watch-set-screen-metrics-switch'),
      'valueChange',
      false
    );
    fireEvent(screen.getByTestId('watch-up-next-switch'), 'valueChange', true);
    fireEvent(
      screen.getByTestId('watch-new-workout-switch'),
      'valueChange',
      true
    );

    expect(prefs().watchSetScreenMetrics).toBe(false);
    expect(prefs().watchUpNextPage).toBe(true);
    expect(prefs().watchNewWorkout).toBe(true);
    // Larger text is its own switch: the new view does not move it.
    expect(prefs().watchLargerText).toBe(false);
    fireEvent(
      screen.getByTestId('watch-larger-text-switch'),
      'valueChange',
      true
    );
    expect(prefs().watchLargerText).toBe(true);
    expect(prefs().watchNewWorkout).toBe(true);
  });

  test('the original workout layout rows hide while the new workout view is on', () => {
    renderScreen();
    expect(screen.getByTestId('watch-set-screen-metrics-switch')).toBeTruthy();
    expect(screen.getByTestId('watch-up-next-switch')).toBeTruthy();
    fireEvent(
      screen.getByTestId('watch-new-workout-switch'),
      'valueChange',
      true
    );
    expect(screen.queryByTestId('watch-set-screen-metrics-switch')).toBeNull();
    expect(screen.queryByTestId('watch-up-next-switch')).toBeNull();
  });

  test('the top line and countdown choices only show while the new workout view is on', () => {
    renderScreen();
    const prefs = () => useAppPreferencesStore.getState();

    expect(prefs().watchNewWorkout).toBe(false);
    expect(prefs().watchWorkoutCountdown).toBe(3);
    expect(screen.queryByText('Countdown sound & haptic')).toBeNull();

    fireEvent(
      screen.getByTestId('watch-new-workout-switch'),
      'valueChange',
      true
    );
    expect(prefs().watchNewWorkout).toBe(true);

    fireEvent.press(screen.getByText('Metrics'));
    expect(prefs().watchWorkoutTopLine).toBe('metrics');
    fireEvent.press(screen.getByText('5 s'));
    expect(prefs().watchWorkoutCountdown).toBe(5);
    fireEvent.press(screen.getByText('Off'));
    expect(prefs().watchWorkoutCountdown).toBe(0);
  });

  test('the countdown before holds switch is on by default, flips, and hides with the new view', () => {
    renderScreen();
    const prefs = () => useAppPreferencesStore.getState();
    expect(prefs().watchHoldCountdown).toBe(true);
    expect(screen.queryByTestId('watch-hold-countdown-switch')).toBeNull();

    fireEvent(
      screen.getByTestId('watch-new-workout-switch'),
      'valueChange',
      true
    );
    const toggle = screen.getByTestId('watch-hold-countdown-switch');
    expect(screen.getByText('Countdown before holds')).toBeTruthy();
    fireEvent(toggle, 'valueChange', false);
    expect(prefs().watchHoldCountdown).toBe(false);
  });

  test('toggling a page hides and shows it', () => {
    renderScreen();

    const trendSwitch = screen.getByTestId('watch-page-switch-trend');
    fireEvent(trendSwitch, 'valueChange', false);
    expect(useAppPreferencesStore.getState().hiddenWatchPages).toEqual([
      'trend',
    ]);

    fireEvent(trendSwitch, 'valueChange', true);
    expect(useAppPreferencesStore.getState().hiddenWatchPages).toEqual([]);
  });

  test('reordering a row updates the saved order', () => {
    renderScreen();

    fireEvent(
      screen.getByTestId('watch-page-drag-handle-goals'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } }
    );

    expect(useAppPreferencesStore.getState().watchPageOrder).toEqual([
      'water',
      'goals',
      'medications',
      'entry',
      'trend',
      'workout',
      'fasting',
      'steps',
    ]);
  });

  test('the last page still shown cannot be turned off', () => {
    useAppPreferencesStore.setState({
      hiddenWatchPages: [
        'goals',
        'water',
        'medications',
        'entry',
        'trend',
        'fasting',
        'steps',
      ],
    });

    renderScreen();

    expect(screen.getByTestId('watch-page-switch-workout').props.disabled).toBe(
      true
    );
    expect(screen.getByTestId('watch-page-switch-goals').props.disabled).toBe(
      false
    );
  });

  describe('Goals page nutrients', () => {
    const nutrientRowKeys = (): string[] =>
      screen
        .queryAllByTestId(/^watch-nutrient-row-/)
        .map((row) =>
          String(row.props.testID).replace('watch-nutrient-row-', '')
        );

    test('lists standard nutrients then custom ones, macros shown by default', () => {
      renderScreen();

      const keys = nutrientRowKeys();
      expect(keys.slice(0, 3)).toEqual(['protein', 'carbs', 'fat']);
      expect(keys).toContain('sodium');
      expect(keys[keys.length - 1]).toBe('Creatine');
      expect(keys).not.toContain('calories');
      expect(
        screen.getByTestId('watch-nutrient-switch-protein').props.value
      ).toBe(true);
      expect(
        screen.getByTestId('watch-nutrient-switch-sodium').props.value
      ).toBe(false);
    });

    test('turning a nutrient on adds it to the Goals page', () => {
      renderScreen();

      fireEvent(
        screen.getByTestId('watch-nutrient-switch-Creatine'),
        'valueChange',
        true
      );

      expect(useAppPreferencesStore.getState().shownWatchNutrients).toEqual([
        'protein',
        'carbs',
        'fat',
        'Creatine',
      ]);
    });

    test('reordering a nutrient saves the whole order', () => {
      renderScreen();

      fireEvent(
        screen.getByTestId('watch-nutrient-drag-handle-protein'),
        'accessibilityAction',
        { nativeEvent: { actionName: 'increment' } }
      );

      expect(
        useAppPreferencesStore.getState().watchNutrientOrder.slice(0, 3)
      ).toEqual(['carbs', 'protein', 'fat']);
    });
  });

  test('the set input control switches the watch between the Digital Crown and the keypad', () => {
    renderScreen();

    expect(useAppPreferencesStore.getState().watchSetInputStyle).toBe('crown');
    fireEvent.press(screen.getByText('Keypad'));
    expect(useAppPreferencesStore.getState().watchSetInputStyle).toBe('keypad');
    fireEvent.press(screen.getByText('Digital Crown'));
    expect(useAppPreferencesStore.getState().watchSetInputStyle).toBe('crown');
  });

  test('on Android (Wear OS), shows New workout view and its sub-options while hiding iOS-only settings', async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    try {
      renderScreen();
      await waitFor(() => {
        expect(WatchConnectivity?.isMediaAccessEnabled).toHaveBeenCalled();
      });
      const prefs = () => useAppPreferencesStore.getState();

      expect(screen.queryByTestId('watch-double-tap-switch')).toBeNull();
      expect(screen.queryByText('Digital Crown')).toBeNull();
      expect(
        screen.queryByTestId('watch-set-screen-metrics-switch')
      ).toBeNull();
      expect(screen.queryByTestId('watch-up-next-switch')).toBeNull();
      expect(screen.queryByTestId('watch-larger-text-switch')).toBeNull();

      const newWorkoutToggle = screen.getByTestId('watch-new-workout-switch');
      expect(newWorkoutToggle).toBeTruthy();
      expect(screen.queryByText('Countdown sound & haptic')).toBeNull();

      fireEvent(newWorkoutToggle, 'valueChange', true);
      expect(prefs().watchNewWorkout).toBe(true);
      expect(screen.getByText('Top line')).toBeTruthy();
      expect(screen.getByText('Countdown sound & haptic')).toBeTruthy();
      expect(screen.getByTestId('watch-hold-countdown-switch')).toBeTruthy();

      fireEvent.press(screen.getByText('Metrics'));
      expect(prefs().watchWorkoutTopLine).toBe('metrics');
      fireEvent.press(screen.getByText('5 s'));
      expect(prefs().watchWorkoutCountdown).toBe(5);
      fireEvent(
        screen.getByTestId('watch-hold-countdown-switch'),
        'valueChange',
        false
      );
      expect(prefs().watchHoldCountdown).toBe(false);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        value: originalOs,
        configurable: true,
      });
    }
  });

  test('hides Now Playing track info row on iOS and shows disclosure flow on Android', async () => {
    renderScreen();
    expect(screen.queryByTestId('watch-media-access-row')).toBeNull();

    const originalOs = Platform.OS;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const isEnabledMock = WatchConnectivity?.isMediaAccessEnabled as jest.Mock;
    const openSettingsMock =
      WatchConnectivity?.openMediaAccessSettings as jest.Mock;
    isEnabledMock.mockResolvedValueOnce(false);

    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    try {
      const { unmount } = renderScreen();

      await waitFor(() => {
        expect(screen.getByTestId('watch-media-access-row')).toBeTruthy();
        expect(screen.getByText('Set up')).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId('watch-media-access-row'));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const buttons = alertSpy.mock.calls[0][2] as {
        text?: string;
        onPress?: () => void;
      }[];
      const openBtn = buttons.find((b) => b.text === 'Open Settings');
      expect(openBtn).toBeDefined();
      openBtn?.onPress?.();
      expect(openSettingsMock).toHaveBeenCalledTimes(1);

      unmount();
      alertSpy.mockClear();
      openSettingsMock.mockClear();
      isEnabledMock.mockResolvedValueOnce(true);

      renderScreen();
      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('watch-media-access-row'));
      expect(alertSpy).not.toHaveBeenCalled();
      expect(openSettingsMock).toHaveBeenCalledTimes(1);
    } finally {
      alertSpy.mockRestore();
      Object.defineProperty(Platform, 'OS', {
        value: originalOs,
        configurable: true,
      });
    }
  });
});
