import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FeatureSettingsScreen from '../../src/screens/FeatureSettingsScreen';
import type { CycleSwitchState } from '../../src/hooks/useMobileFeatures';
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
  return { __esModule: true, default: () => <View testID="icon" /> };
});

let mockCycle: {
  on: boolean;
  state: CycleSwitchState;
  isPending: boolean;
  needsSetup: boolean;
  settings: { discreet_mode: boolean } | null | undefined;
};
const mockSetOn = jest.fn();
const mockOpenSetup = jest.fn();
const mockReload = jest.fn();
jest.mock('../../src/hooks/useMobileFeatures', () => ({
  useCycleSwitch: () => ({
    ...mockCycle,
    setOn: mockSetOn,
    openSetup: mockOpenSetup,
    reload: mockReload,
  }),
}));

const renderScreen = () => render(<FeatureSettingsScreen {...({} as never)} />);

/** Every text on screen, and the switch's name, to check what they never say. */
const allText = () =>
  [
    ...screen
      .UNSAFE_getAllByType(Text)
      .map((node) => JSON.stringify(node.props.children)),
    ...screen
      .queryAllByRole('switch')
      .map((node) => String(node.props.accessibilityLabel)),
  ].join(' ');

describe('FeatureSettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCycle = {
      on: false,
      state: 'ready',
      isPending: false,
      needsSetup: false,
      settings: null,
    };
  });

  it('lists cycle under Health, with a switch for the app and the website', () => {
    renderScreen();
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.getByLabelText('Cycle & Pregnancy').props.value).toBe(false);
    expect(
      screen.getByText(/One switch for the app and the website\./)
    ).toBeTruthy();
  });

  it('turns cycle on', () => {
    renderScreen();
    fireEvent(screen.getByTestId('feature-switch-cycle'), 'valueChange', true);
    expect(mockSetOn).toHaveBeenCalledWith(true);
  });

  it('turns cycle off', () => {
    mockCycle = {
      ...mockCycle,
      on: true,
      settings: { discreet_mode: false },
    };
    renderScreen();
    expect(screen.getByTestId('feature-switch-cycle').props.value).toBe(true);
    fireEvent(screen.getByTestId('feature-switch-cycle'), 'valueChange', false);
    expect(mockSetOn).toHaveBeenCalledWith(false);
  });

  it.each(['loading', 'loadFailed'] as const)(
    'names nothing while cycle settings are %s, as discreet mode is not known yet',
    (state) => {
      mockCycle = { ...mockCycle, state, settings: undefined };
      renderScreen();
      expect(screen.queryByTestId('feature-switch-cycle')).toBeNull();
      expect(allText()).not.toMatch(/cycle|period|fertil|pregnan/i);
    }
  );

  it('cannot be switched while a change is saving', () => {
    mockCycle = { ...mockCycle, isPending: true };
    renderScreen();
    expect(screen.getByTestId('feature-switch-cycle').props.disabled).toBe(
      true
    );
  });

  it('offers a retry when the setting could not load', () => {
    mockCycle = { ...mockCycle, state: 'loadFailed', settings: undefined };
    renderScreen();
    expect(screen.getByText('Could not load this setting.')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('offers to finish the setup while cycle is on but not set up', () => {
    mockCycle = { ...mockCycle, on: true, needsSetup: true };
    renderScreen();
    fireEvent.press(screen.getByText('Set up'));
    expect(mockOpenSetup).toHaveBeenCalledTimes(1);
  });

  it('never says Cycle in discreet mode', () => {
    mockCycle = {
      ...mockCycle,
      on: true,
      settings: { discreet_mode: true },
    };
    renderScreen();
    expect(screen.getByLabelText('Wellness').props.value).toBe(true);
    expect(allText()).not.toMatch(/cycle|period|fertil|pregnan/i);
  });
});
