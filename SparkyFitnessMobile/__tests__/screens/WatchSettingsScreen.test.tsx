import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import WatchSettingsScreen from '../../src/screens/WatchSettingsScreen';
import { WATCH_PAGE_KEYS } from '../../src/constants/watchPages';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';

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

  test('the set input control switches the watch to the Digital Crown', () => {
    renderScreen();

    expect(useAppPreferencesStore.getState().watchSetInputStyle).toBe('keypad');
    fireEvent.press(screen.getByText('Digital Crown'));
    expect(useAppPreferencesStore.getState().watchSetInputStyle).toBe('crown');
    fireEvent.press(screen.getByText('Keypad'));
    expect(useAppPreferencesStore.getState().watchSetInputStyle).toBe('keypad');
  });
});
