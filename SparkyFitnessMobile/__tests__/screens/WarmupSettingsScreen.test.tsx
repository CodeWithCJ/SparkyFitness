import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import WarmupSettingsScreen from '../../src/screens/WarmupSettingsScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_weight_unit: 'kg' } }),
}));

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const renderScreen = () =>
  render(
    <WarmupSettingsScreen
      navigation={mockNavigation}
      route={{ params: {} } as any}
    />
  );

const method = () => useAppPreferencesStore.getState().warmupMethod;

describe('WarmupSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
  });

  it('shows the default method, one row per step', () => {
    const { getByTestId } = renderScreen();
    expect(getByTestId('warmup-percent-0').props.value).toBe('40');
    expect(getByTestId('warmup-reps-0').props.value).toBe('5');
    expect(getByTestId('warmup-percent-2').props.value).toBe('80');
    expect(getByTestId('warmup-reps-2').props.value).toBe('3');
  });

  it('turns the calculator off and on', () => {
    const { getByTestId } = renderScreen();
    fireEvent(getByTestId('warmup-calculator-switch'), 'valueChange', false);
    expect(useAppPreferencesStore.getState().warmupCalculatorEnabled).toBe(
      false
    );
  });

  it('adds a step that continues the climb, and removes the last one', () => {
    const { getByTestId, queryByTestId } = renderScreen();
    fireEvent.press(getByTestId('warmup-add-set'));
    expect(method()).toHaveLength(4);
    expect(method()[3]).toEqual({ percent: 90, reps: 2 });
    expect(getByTestId('warmup-percent-3')).toBeTruthy();

    fireEvent.press(getByTestId('warmup-remove-set'));
    fireEvent.press(getByTestId('warmup-remove-set'));
    expect(method()).toHaveLength(2);
    expect(queryByTestId('warmup-percent-2')).toBeNull();
  });

  it('keeps at least one step', () => {
    useAppPreferencesStore
      .getState()
      .setWarmupMethod([{ percent: 50, reps: 5 }]);
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('warmup-remove-set'));
    expect(method()).toEqual([{ percent: 50, reps: 5 }]);
  });

  it('writes an edited percent or reps back when the field is left', () => {
    const { getByTestId } = renderScreen();
    const percent = getByTestId('warmup-percent-0');
    fireEvent.changeText(percent, '45');
    // Nothing is saved while it is being typed.
    expect(method()[0]!.percent).toBe(40);
    fireEvent(percent, 'blur');
    expect(method()[0]).toEqual({ percent: 45, reps: 5 });

    const reps = getByTestId('warmup-reps-1');
    fireEvent.changeText(reps, '8');
    fireEvent(reps, 'blur');
    expect(method()[1]).toEqual({ percent: 60, reps: 8 });
  });

  it('ignores an empty or zero entry, and caps the percent', () => {
    const { getByTestId } = renderScreen();
    const percent = getByTestId('warmup-percent-0');
    fireEvent.changeText(percent, '');
    fireEvent(percent, 'blur');
    expect(method()[0]!.percent).toBe(40);
    expect(getByTestId('warmup-percent-0').props.value).toBe('40');

    fireEvent.changeText(percent, '0');
    fireEvent(percent, 'blur');
    expect(method()[0]!.percent).toBe(40);

    fireEvent.changeText(percent, '150');
    fireEvent(percent, 'blur');
    expect(method().some((s) => s.percent === 95)).toBe(true);
  });

  it('resets to the default method', () => {
    useAppPreferencesStore
      .getState()
      .setWarmupMethod([{ percent: 50, reps: 5 }]);
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('warmup-reset'));
    expect(method()).toEqual([
      { percent: 40, reps: 5 },
      { percent: 60, reps: 5 },
      { percent: 80, reps: 3 },
    ]);
  });
});
