import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import NotificationSettingsScreen from '../../src/screens/NotificationSettingsScreen';
import {
  maybePromptForExactAlarmPermission,
  requestNotificationPermission,
  setNotificationsEnabled,
  setRestTimerNotificationsEnabled,
} from '../../src/services/notifications';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/notifications', () => ({
  requestNotificationPermission: jest.fn(async () => 'granted'),
  setNotificationsEnabled: jest.fn(async () => undefined),
  setRestTimerNotificationsEnabled: jest.fn(async () => undefined),
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

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as never;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockRequestPermission = requestNotificationPermission as jest.MockedFunction<
  typeof requestNotificationPermission
>;
const mockSetNotificationsEnabled = setNotificationsEnabled as jest.MockedFunction<
  typeof setNotificationsEnabled
>;
const mockSetRestTimerEnabled = setRestTimerNotificationsEnabled as jest.MockedFunction<
  typeof setRestTimerNotificationsEnabled
>;
const mockMaybePrompt = maybePromptForExactAlarmPermission as jest.MockedFunction<
  typeof maybePromptForExactAlarmPermission
>;

const route = { params: {} } as never;

function renderScreen() {
  return render(<NotificationSettingsScreen navigation={mockNavigation} route={route} />);
}

// Switch order with everything enabled and the banner mocked out:
// [Allow Notifications, Rest Timer, Fasting Goals, Medication Reminders,
//  Repeat Reminders, Hide Medication Names]. Rows after index 0 disappear
// when the master toggle is off; medication sub-rows require the medication
// toggle. Indices below only address rows whose presence the test controls.
const MASTER_SWITCH_INDEX = 0;
const REST_TIMER_SWITCH_INDEX = 1;
const FASTING_SWITCH_INDEX = 2;
const MEDICATION_SWITCH_INDEX = 3;

describe('NotificationSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockRequestPermission.mockResolvedValue('granted');
  });

  it('hides category rows while the master toggle is off', () => {
    useAppPreferencesStore.setState({ notificationsEnabled: false });
    const { getAllByRole } = renderScreen();
    expect(getAllByRole('switch')).toHaveLength(1);
  });

  it('turning the master toggle on enables notifications and requests OS permission', async () => {
    useAppPreferencesStore.setState({ notificationsEnabled: false });
    const { getAllByRole } = renderScreen();

    fireEvent(getAllByRole('switch')[MASTER_SWITCH_INDEX], 'valueChange', true);

    await waitFor(() => {
      expect(mockSetNotificationsEnabled).toHaveBeenCalledWith(true);
    });
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('turning the master toggle off skips the OS permission request', async () => {
    const { getAllByRole } = renderScreen();

    fireEvent(getAllByRole('switch')[MASTER_SWITCH_INDEX], 'valueChange', false);

    await waitFor(() => {
      expect(mockSetNotificationsEnabled).toHaveBeenCalledWith(false);
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('routes the rest-timer toggle through the service so pending pings are cancelled', () => {
    const { getAllByRole } = renderScreen();

    fireEvent(getAllByRole('switch')[REST_TIMER_SWITCH_INDEX], 'valueChange', false);

    expect(mockSetRestTimerEnabled).toHaveBeenCalledWith(false);
  });

  it('flips the fasting-goal preference directly', () => {
    const { getAllByRole } = renderScreen();

    fireEvent(getAllByRole('switch')[FASTING_SWITCH_INDEX], 'valueChange', false);

    expect(useAppPreferencesStore.getState().fastingGoalNotificationsEnabled).toBe(false);
  });

  describe('medication reminders toggle', () => {
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
});
