import React from 'react';
import { Text } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import FeatureSettingsScreen from '../../src/screens/FeatureSettingsScreen';
import type { FeatureKey } from '@workspace/shared';
import type { CycleSwitchState } from '../../src/hooks/useMobileFeatures';
import type { FeatureChoiceState } from '../../src/hooks/useFeatureChoices';
import { initializeI18n } from '../../src/localization/i18n';

const mockRefetchOnFocus = jest.fn();
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: (refetch: () => void, enabled: boolean) =>
    mockRefetchOnFocus(refetch, enabled),
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
let mockFeaturesOff = new Set<FeatureKey>();
jest.mock('../../src/hooks/useMobileFeatures', () => ({
  useCycleSwitch: () => ({
    ...mockCycle,
    setOn: mockSetOn,
    openSetup: mockOpenSetup,
    reload: mockReload,
  }),
  useMobileFeatures: () => ({
    isEnabled: (key: FeatureKey) => !mockFeaturesOff.has(key),
  }),
}));

let mockChoice: { state: FeatureChoiceState; isPending: boolean };
const mockSetFeatureOn = jest.fn();
const mockReloadChoices = jest.fn();
jest.mock('../../src/hooks/useFeatureChoices', () => ({
  useSetMobileFeatureChoice: () => ({
    ...mockChoice,
    setFeatureOn: mockSetFeatureOn,
    reload: mockReloadChoices,
  }),
}));

const renderScreen = () => render(<FeatureSettingsScreen {...({} as never)} />);

const featureRow = (feature: FeatureKey) =>
  within(screen.getByTestId(`feature-row-${feature}`));

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
    mockFeaturesOff = new Set();
    mockChoice = { state: 'ready', isPending: false };
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

  it('lists lab results under Health, on by default, for this app only', () => {
    renderScreen();
    const toggle = screen.getByLabelText('Lab results');
    expect(toggle.props.value).toBe(true);
    expect(toggle.props.disabled).toBe(false);
    expect(
      featureRow('labResults').getByText(
        /Only this app\. The website has its own switch\./
      )
    ).toBeTruthy();
  });

  it('turns lab results off in this app', () => {
    renderScreen();
    fireEvent(
      screen.getByTestId('feature-switch-labResults'),
      'valueChange',
      false
    );
    expect(mockSetFeatureOn).toHaveBeenCalledWith('labResults', false);
  });

  it('turns lab results back on', () => {
    mockFeaturesOff = new Set<FeatureKey>(['labResults']);
    renderScreen();
    const toggle = screen.getByTestId('feature-switch-labResults');
    expect(toggle.props.value).toBe(false);
    fireEvent(toggle, 'valueChange', true);
    expect(mockSetFeatureOn).toHaveBeenCalledWith('labResults', true);
  });

  it('lists medications under Health, on by default, for this app only', () => {
    renderScreen();
    const toggle = screen.getByLabelText('Medications');
    expect(toggle.props.value).toBe(true);
    expect(toggle.props.disabled).toBe(false);
    const row = featureRow('medications');
    expect(
      row.getByText(/^Medications, supplements and GLP-1 tracking\./)
    ).toBeTruthy();
    expect(
      row.getByText(
        /While it is off, reminders stop and come back when you turn it on; supplement nutrients still count in your totals\./
      )
    ).toBeTruthy();
    expect(
      row.getByText(/Only this app\. The website has its own switch\./)
    ).toBeTruthy();
  });

  it('lists the Health features in the registry order', () => {
    renderScreen();
    const rows = screen
      .queryAllByTestId(/^feature-row-/)
      .map((node) => String(node.props.testID));
    expect(rows).toEqual([
      'feature-row-cycle',
      'feature-row-medications',
      'feature-row-labResults',
      'feature-row-aiCoaches',
    ]);
  });

  it('turns coaches on in this app', () => {
    renderScreen();
    fireEvent(
      screen.getByTestId('feature-switch-aiCoaches'),
      'valueChange',
      true
    );
    expect(mockSetFeatureOn).toHaveBeenCalledWith('aiCoaches', true);
  });

  it('turns medications off in this app', () => {
    renderScreen();
    fireEvent(
      screen.getByTestId('feature-switch-medications'),
      'valueChange',
      false
    );
    expect(mockSetFeatureOn).toHaveBeenCalledWith('medications', false);
  });

  it('turns medications back on', () => {
    mockFeaturesOff = new Set<FeatureKey>(['medications']);
    renderScreen();
    const toggle = screen.getByTestId('feature-switch-medications');
    expect(toggle.props.value).toBe(false);
    // Only medications is off.
    expect(screen.getByTestId('feature-switch-labResults').props.value).toBe(
      true
    );
    fireEvent(toggle, 'valueChange', true);
    expect(mockSetFeatureOn).toHaveBeenCalledWith('medications', true);
  });

  it.each([
    ['the choices load', { state: 'loading', isPending: false }],
    ['a change is saving', { state: 'ready', isPending: true }],
  ] as const)('cannot switch lab results while %s', (_label, choice) => {
    mockChoice = choice;
    renderScreen();
    expect(screen.getByTestId('feature-switch-labResults').props.disabled).toBe(
      true
    );
  });

  it('offers a retry when the lab results choice could not load', () => {
    mockChoice = { state: 'loadFailed', isPending: false };
    renderScreen();
    expect(screen.getByTestId('feature-switch-labResults').props.disabled).toBe(
      true
    );
    // One under each switch that reads the choices: medications, lab results,
    // coaches.
    const retries = screen.getAllByText('Retry');
    expect(retries).toHaveLength(3);
    fireEvent.press(retries[1]);
    expect(mockReloadChoices).toHaveBeenCalledTimes(1);
  });

  it('says the server needs an update when it is older than Features', () => {
    mockChoice = { state: 'serverTooOld', isPending: false };
    renderScreen();
    expect(screen.getByTestId('feature-switch-labResults').props.disabled).toBe(
      true
    );
    expect(
      featureRow('labResults').getByText(
        /Update your SparkyFitness server to change this\./
      )
    ).toBeTruthy();
  });

  it('asks the server again on each visit while it is older than Features', () => {
    mockChoice = { state: 'serverTooOld', isPending: false };
    renderScreen();
    expect(mockRefetchOnFocus).toHaveBeenLastCalledWith(
      mockReloadChoices,
      true
    );
  });

  it('does not ask again on each visit once the choices are known', () => {
    renderScreen();
    expect(mockRefetchOnFocus).toHaveBeenLastCalledWith(
      mockReloadChoices,
      false
    );
  });

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
