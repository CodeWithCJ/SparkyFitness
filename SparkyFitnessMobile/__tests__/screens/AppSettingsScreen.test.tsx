import React from 'react';
import { fireEvent, render, act, screen } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import Toast from 'react-native-toast-message';

import AppSettingsScreen from '../../src/screens/AppSettingsScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import { AppLanguageNative } from '../../src/services/appLanguageNative';

jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  interface MockPickerProps {
    accessibilityHint?: string;
    onSelect?: (value: string | number) => void;
    value?: string | number;
    title?: string;
  }
  const MockPicker = (props: MockPickerProps) =>
    React.createElement(View, { testID: 'bottom-sheet-picker', ...props });
  return { __esModule: true, default: MockPicker };
});

jest.mock('../../src/services/appLanguageNative', () => ({
  AppLanguageNative: {
    isAvailable: false,
    supportsNativePerAppLanguage: false,
    setApplicationLanguage: jest.fn(async () => undefined),
    getApplicationLanguage: jest.fn(async () => null),
    getEffectiveLanguage: jest.fn(async () => 'en'),
  },
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/services/themeService', () => ({
  useThemePreference: () => 'System',
  setThemePreference: jest.fn(),
}));

jest.mock('../../src/utils/liquidGlass', () => ({
  canUseLiquidGlass: () => false,
}));

const mockNative = AppLanguageNative as jest.Mocked<typeof AppLanguageNative>;
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
} as never;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const route = { params: {} } as never;

function renderScreen() {
  return render(<AppSettingsScreen navigation={mockNavigation} route={route} />);
}

function picker() {
  // The screen renders two BottomSheetPickers (Theme row + Language row); the
  // language one is the only one carrying an accessibilityHint prop.
  const pickers = screen.getAllByTestId('bottom-sheet-picker');
  const languagePicker = pickers.find(
    (p) => p.props.accessibilityHint !== undefined,
  );
  if (!languagePicker) {
    throw new Error('Language BottomSheetPicker not found');
  }
  return languagePicker.props as {
    accessibilityHint?: string;
    onSelect?: (value: string | number) => Promise<unknown> | void;
  };
}

// Switch order with the liquid glass row absent: [Haptics, Camera].
const HAPTICS_SWITCH_INDEX = 0;

describe('AppSettingsScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockNative.supportsNativePerAppLanguage = false;
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    jest.replaceProperty(Platform, 'OS', 'android');
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'en' }]);
    mockNative.setApplicationLanguage.mockClear();
    mockNative.setApplicationLanguage.mockResolvedValue(undefined);
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  it('renders the language preference row with English labels', () => {
    const { getByText } = renderScreen();

    expect(getByText('Language')).toBeTruthy();
    expect(
      getByText('Use your device language or choose a language for SparkyFitness.'),
    ).toBeTruthy();
  });

  it('announces the English picker hint in English UI', () => {
    renderScreen();

    expect(picker().accessibilityHint).toBe('Opens language selection menu');
  });

  it('announces the Polish picker hint in Polish UI', async () => {
    await i18n.changeLanguage('pl');

    renderScreen();

    expect(picker().accessibilityHint).toBe('Otwiera menu wyboru języka');
  });


  it('renders the native iOS language and opens Settings without changing language state', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'pl' }]);
    useAppPreferencesStore.setState({ languagePreference: 'en' });
    await i18n.changeLanguage('en');

    renderScreen();

    expect(screen.getByText('Polski · Managed by iOS')).toBeTruthy();
    const languagePickers = screen.getAllByTestId('bottom-sheet-picker').filter(
      (node) => node.props.accessibilityHint !== undefined,
    );
    expect(languagePickers).toHaveLength(0);

    await act(async () => {
      fireEvent.press(screen.getByTestId('ios-language-row'));
    });

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(i18n.resolvedLanguage).toBe('en');
    expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
  });

  it('keeps iOS language state unchanged when Settings cannot be opened', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'pl' }]);
    (Linking.openSettings as jest.Mock).mockRejectedValueOnce(new Error('not available'));
    useAppPreferencesStore.setState({ languagePreference: 'en' });
    await i18n.changeLanguage('en');

    renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId('ios-language-row'));
    });

    expect(i18n.resolvedLanguage).toBe('en');
    expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
  });

  it('shows an error toast and preserves the previous language when the selection fails', async () => {
    mockNative.supportsNativePerAppLanguage = true;
    mockNative.setApplicationLanguage.mockRejectedValue(new Error('native unavailable'));
    useAppPreferencesStore.setState({ languagePreference: 'en' });

    renderScreen();

    await act(async () => {
      await picker().onSelect?.('pl');
    });

    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text1: "Couldn't change the language",
      }),
    );
    expect(useAppPreferencesStore.getState().languagePreference).toBe('en');
    expect(i18n.resolvedLanguage).toBe('en');
  });

  it('navigates to NotificationSettings from the Notifications row', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Notifications'));

    expect((mockNavigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith(
      'NotificationSettings',
    );
  });

  it('flips the haptics preference from its switch', () => {
    const { UNSAFE_getAllByType } = renderScreen();
    const switches = UNSAFE_getAllByType(require('react-native').Switch);

    fireEvent(switches[HAPTICS_SWITCH_INDEX], 'valueChange', false);

    expect(useAppPreferencesStore.getState().hapticsEnabled).toBe(false);
  });
});
