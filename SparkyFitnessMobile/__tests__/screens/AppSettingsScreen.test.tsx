import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AppSettingsScreen from '../../src/screens/AppSettingsScreen';
import {
  maybePromptForExactAlarmPermission,
  requestNotificationPermission,
} from '../../src/services/notifications';
import { applyLanguagePreference } from '../../src/localization';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/notifications', () => ({
  requestNotificationPermission: jest.fn(async () => 'granted'),
  setNotificationsEnabled: jest.fn(async () => undefined),
  maybePromptForExactAlarmPermission: jest.fn(async () => undefined),
}));

jest.mock('../../src/components/NotificationPermissionBanner', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: ReactModule.forwardRef((_props: unknown, ref: unknown) => {
      ReactModule.useImperativeHandle(ref, () => ({ refresh: jest.fn() }));
      return null;
    }),
  };
});

jest.mock('../../src/components/BottomSheetPicker', () => {
  const ReactNative = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      value,
      options,
      onSelect,
    }: {
      title: string;
      value: string;
      options: { label: string; value: string }[];
      onSelect: (value: string) => void;
    }) => (
      <ReactNative.View>
        <ReactNative.Text>{title}</ReactNative.Text>
        <ReactNative.Text testID={`picker-value-${value}`}>{value}</ReactNative.Text>
        {options.map((option) => (
          <ReactNative.Pressable
            key={option.value}
            testID={`picker-option-${option.value}`}
            onPress={() => onSelect(option.value)}
          >
            <ReactNative.Text>{option.label}</ReactNative.Text>
          </ReactNative.Pressable>
        ))}
      </ReactNative.View>
    ),
  };
});

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

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as never;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const enResource = require('../../src/localization/locales/en/translation.json');
const plResource = require('../../src/localization/locales/pl/translation.json');
(globalThis as any).__I18N_EN = enResource;
(globalThis as any).__I18N_PL = plResource;
(globalThis as any).__I18N_LANG = (globalThis as any).__I18N_LANG || 'en';

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const res = (globalThis.__I18N_LANG === 'pl' ? globalThis.__I18N_PL : globalThis.__I18N_EN) ?? {};
        return key.split('.').reduce((acc: any, part: string) => (acc == null ? acc : acc[part]), res) ?? key;
      },
      i18n: null,
      ready: true,
    }),
  };
});

jest.mock('../../src/localization', () => {
  const actual = jest.requireActual('../../src/localization');
  return {
    ...actual,
    applyLanguagePreference: jest.fn(async (value: 'en' | 'pl' | 'system') => {
      globalThis.__I18N_LANG = value === 'system' ? 'en' : value;
    }),
  };
});

const mockRequestPermission = requestNotificationPermission as jest.MockedFunction<
  typeof requestNotificationPermission
>;
const mockMaybePrompt = maybePromptForExactAlarmPermission as jest.MockedFunction<
  typeof maybePromptForExactAlarmPermission
>;
const mockApplyLanguagePreference = applyLanguagePreference as jest.MockedFunction<
  typeof applyLanguagePreference
>;

const route = { params: {} } as never;

function renderScreen() {
  return render(<AppSettingsScreen navigation={mockNavigation} route={route} />);
}

// Switch order with the banner and liquid glass row absent:
// [Notifications, Medication Reminders, (Repeat Reminders), Haptics, Camera].
const MEDICATION_SWITCH_INDEX = 1;

describe('AppSettingsScreen medication reminders toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockRequestPermission.mockResolvedValue('granted');
  });

  it('enables the pref and prompts for exact alarms when permission is granted', async () => {
    useAppPreferencesStore.setState({ medicationRemindersEnabled: false });
    const { getAllByRole } = renderScreen();

    fireEvent(getAllByRole('switch')[MEDICATION_SWITCH_INDEX], 'valueChange', true);

    await waitFor(() => {
      expect(useAppPreferencesStore.getState().medicationRemindersEnabled).toBe(true);
    });
    expect(mockMaybePrompt).toHaveBeenCalledTimes(1);
  });

  it('leaves the pref off and skips the exact-alarm prompt when permission is not granted', async () => {
    useAppPreferencesStore.setState({ medicationRemindersEnabled: false });
    mockRequestPermission.mockResolvedValue('denied');
    const { getAllByRole } = renderScreen();

    fireEvent(getAllByRole('switch')[MEDICATION_SWITCH_INDEX], 'valueChange', true);

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalled();
    });
    expect(useAppPreferencesStore.getState().medicationRemindersEnabled).toBe(false);
    expect(mockMaybePrompt).not.toHaveBeenCalled();
  });

  it('disables the pref without requesting permission or prompting', async () => {
    const { getAllByRole } = renderScreen();

    fireEvent(getAllByRole('switch')[MEDICATION_SWITCH_INDEX], 'valueChange', false);

    await waitFor(() => {
      expect(useAppPreferencesStore.getState().medicationRemindersEnabled).toBe(false);
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockMaybePrompt).not.toHaveBeenCalled();
  });
});

describe('AppSettingsScreen localization', () => {
  beforeAll(() => {
    (globalThis as any).__I18N_EN = enResource;
    (globalThis as any).__I18N_PL = plResource;
    (globalThis as any).__I18N_LANG = 'en';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    (globalThis as any).__I18N_LANG = 'en';
  });

  it('renders language options in English', () => {
    const screen = renderScreen();
    expect(screen.getAllByText('Language').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Theme').length).toBeGreaterThan(0);
    expect(screen.getAllByText('System').length).toBeGreaterThan(0);
    expect(screen.getAllByText('English').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Polish').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Light').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dark').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AMOLED').length).toBeGreaterThan(0);
  });

  it('renders language options in Polish after the language changes', () => {
    (globalThis as any).__I18N_LANG = 'pl';
    const screen = renderScreen();
    expect(screen.getAllByText('Język').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Motyw').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Systemowy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Angielski').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Polski').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jasny').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ciemny').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AMOLED').length).toBeGreaterThan(0);
  });

  it('changes language through the picker without resetting the screen or navigation', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByTestId('picker-option-pl'));

    await waitFor(() => {
      expect(useAppPreferencesStore.getState().languagePreference).toBe('pl');
      expect(mockApplyLanguagePreference).toHaveBeenCalledWith('pl');
      expect(screen.getAllByText('Język').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Motyw').length).toBeGreaterThan(0);
    });

    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(screen.getByTestId('picker-option-pl')).toBeTruthy();
    expect(screen.queryByText('Onboarding')).toBeNull();
    expect(screen.queryByText('Log in')).toBeNull();
  });
});
