import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AppSettingsScreen from '../../src/screens/AppSettingsScreen';
import {
  maybePromptForExactAlarmPermission,
  requestNotificationPermission,
} from '../../src/services/notifications';
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

jest.mock('../../src/components/BottomSheetPicker', () => ({
  __esModule: true,
  default: () => null,
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

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as never;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockRequestPermission = requestNotificationPermission as jest.MockedFunction<
  typeof requestNotificationPermission
>;
const mockMaybePrompt = maybePromptForExactAlarmPermission as jest.MockedFunction<
  typeof maybePromptForExactAlarmPermission
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
