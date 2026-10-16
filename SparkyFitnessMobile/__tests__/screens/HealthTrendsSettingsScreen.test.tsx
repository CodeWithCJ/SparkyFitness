import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import HealthTrendsSettingsScreen from '../../src/screens/HealthTrendsSettingsScreen';
import { HEALTH_TREND_KEYS } from '../../src/constants/healthTrends';
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
    <HealthTrendsSettingsScreen
      {...({ navigation, route: { params: {} } } as never)}
    />
  );

const orderedRowKeys = (): string[] =>
  screen
    .queryAllByTestId(/^health-trend-row-/)
    .map((row) => String(row.props.testID).replace('health-trend-row-', ''));

describe('HealthTrendsSettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
  });

  const moveRow = (trendKey: string, actionName: 'increment' | 'decrement') =>
    fireEvent(
      screen.getByTestId(`health-trend-drag-handle-${trendKey}`),
      'accessibilityAction',
      { nativeEvent: { actionName } }
    );

  test('lists every registered trend in the saved order', () => {
    useAppPreferencesStore.setState({
      healthTrendOrder: [
        'sleep',
        'steps',
        'weight',
        'hydration',
        'calories',
        'vo2max',
      ],
    });

    renderScreen();

    expect(orderedRowKeys()).toEqual([
      'sleep',
      'steps',
      'weight',
      'hydration',
      'calories',
      'vo2max',
    ]);
    expect(orderedRowKeys()).toHaveLength(HEALTH_TREND_KEYS.length);
  });

  test('toggling a trend switch updates hiddenHealthTrends in the store', () => {
    renderScreen();

    const stepsSwitch = screen.getByTestId('health-trend-switch-steps');
    expect(stepsSwitch.props.value).toBe(true);

    // Toggle off
    fireEvent(stepsSwitch, 'valueChange', false);
    expect(useAppPreferencesStore.getState().hiddenHealthTrends).toContain(
      'steps'
    );

    // Toggle on
    fireEvent(stepsSwitch, 'valueChange', true);
    expect(useAppPreferencesStore.getState().hiddenHealthTrends).not.toContain(
      'steps'
    );
  });

  test('reordering rows updates healthTrendOrder', () => {
    renderScreen();

    moveRow('steps', 'increment');

    const state = useAppPreferencesStore.getState();
    expect(state.healthTrendOrder).toEqual([
      'weight',
      'steps',
      'sleep',
      'hydration',
      'calories',
      'vo2max',
    ]);
  });

  test('the decrement action on the first row is a no-op', () => {
    renderScreen();

    moveRow('steps', 'decrement');

    expect(useAppPreferencesStore.getState().healthTrendOrder).toEqual([
      ...HEALTH_TREND_KEYS,
    ]);
  });
});
