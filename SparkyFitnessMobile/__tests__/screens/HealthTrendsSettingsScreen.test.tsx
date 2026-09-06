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
      healthTrendOrder: ['sleep', 'steps', 'weight'],
    });

    renderScreen();

    expect(orderedRowKeys()).toEqual(['sleep', 'steps', 'weight']);
    expect(orderedRowKeys()).toHaveLength(HEALTH_TREND_KEYS.length);
  });

  test('renders hidden trends below the divider', () => {
    useAppPreferencesStore.setState({ hiddenHealthTrends: ['weight'] });

    renderScreen();

    expect(orderedRowKeys()).toEqual(['steps', 'sleep', 'weight']);
    expect(screen.getByTestId('health-trend-divider')).toBeTruthy();
  });

  test('dragging the last shown trend past the divider hides it', () => {
    useAppPreferencesStore.setState({
      healthTrendOrder: ['steps', 'weight', 'sleep'],
      hiddenHealthTrends: ['weight', 'sleep'],
    });

    renderScreen();
    // Steps is the only shown row, so moving it down crosses the divider.
    moveRow('steps', 'increment');

    expect(useAppPreferencesStore.getState().hiddenHealthTrends).toContain(
      'steps'
    );
  });

  test('dragging a hidden trend above the divider shows it again', () => {
    useAppPreferencesStore.setState({
      healthTrendOrder: ['steps', 'weight', 'sleep'],
      hiddenHealthTrends: ['steps'],
    });

    renderScreen();
    // Steps sits directly below the divider, so moving it up crosses back.
    moveRow('steps', 'decrement');

    expect(useAppPreferencesStore.getState().hiddenHealthTrends).not.toContain(
      'steps'
    );
  });

  test('reordering above the divider does not change visibility', () => {
    renderScreen();

    moveRow('steps', 'increment');

    const state = useAppPreferencesStore.getState();
    expect(state.healthTrendOrder).toEqual(['weight', 'steps', 'sleep']);
    expect(state.hiddenHealthTrends).toEqual([]);
  });

  test('the decrement action on the first row is a no-op', () => {
    renderScreen();

    moveRow('steps', 'decrement');

    expect(useAppPreferencesStore.getState().healthTrendOrder).toEqual([
      ...HEALTH_TREND_KEYS,
    ]);
  });

  test('prompts when nothing is hidden yet', () => {
    renderScreen();

    expect(screen.getByTestId('health-trend-empty-hidden')).toBeTruthy();
    expect(screen.queryByTestId('health-trend-empty-shown')).toBeNull();
  });

  test('prompts when every trend is hidden', () => {
    useAppPreferencesStore.setState({
      hiddenHealthTrends: [...HEALTH_TREND_KEYS],
    });

    renderScreen();

    expect(screen.getByTestId('health-trend-empty-shown')).toBeTruthy();
    expect(screen.queryByTestId('health-trend-empty-hidden')).toBeNull();
  });
});
