import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';

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

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { time_format: 'HH:mm' } }),
}));

type MockTimeSheetProps = {
  value: string;
  onSelectTime: (time: string) => void;
};
const mockTimeSheetRenders: MockTimeSheetProps[] = [];
jest.mock('../../src/components/TimeSheet', () => {
  const ReactModule = require('react');
  const MockTimeSheet = ReactModule.forwardRef(
    (props: MockTimeSheetProps, ref: unknown) => {
      ReactModule.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      mockTimeSheetRenders.push(props);
      return null;
    }
  );
  MockTimeSheet.displayName = 'MockTimeSheet';
  return { __esModule: true, default: MockTimeSheet };
});

/** The most recently rendered time sheet currently showing `value`. */
function latestTimeSheet(value: string): MockTimeSheetProps {
  const matches = mockTimeSheetRenders.filter((p) => p.value === value);
  const match = matches[matches.length - 1];
  if (!match) throw new Error(`No time sheet rendered with value ${value}`);
  return match;
}

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as never;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockRequestPermission =
  requestNotificationPermission as jest.MockedFunction<
    typeof requestNotificationPermission
  >;
const mockSetNotificationsEnabled =
  setNotificationsEnabled as jest.MockedFunction<
    typeof setNotificationsEnabled
  >;
const mockSetRestTimerEnabled =
  setRestTimerNotificationsEnabled as jest.MockedFunction<
    typeof setRestTimerNotificationsEnabled
  >;
const mockMaybePrompt =
  maybePromptForExactAlarmPermission as jest.MockedFunction<
    typeof maybePromptForExactAlarmPermission
  >;

const route = { params: {} } as never;

function renderScreen() {
  return render(
    <NotificationSettingsScreen navigation={mockNavigation} route={route} />
  );
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
    mockTimeSheetRenders.length = 0;
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

    fireEvent(
      getAllByRole('switch')[MASTER_SWITCH_INDEX],
      'valueChange',
      false
    );

    await waitFor(() => {
      expect(mockSetNotificationsEnabled).toHaveBeenCalledWith(false);
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('routes the rest-timer toggle through the service so pending pings are cancelled', () => {
    const { getAllByRole } = renderScreen();

    fireEvent(
      getAllByRole('switch')[REST_TIMER_SWITCH_INDEX],
      'valueChange',
      false
    );

    expect(mockSetRestTimerEnabled).toHaveBeenCalledWith(false);
  });

  it('flips the fasting-goal preference directly', () => {
    const { getAllByRole } = renderScreen();

    fireEvent(
      getAllByRole('switch')[FASTING_SWITCH_INDEX],
      'valueChange',
      false
    );

    expect(
      useAppPreferencesStore.getState().fastingGoalNotificationsEnabled
    ).toBe(false);
  });

  describe('medication reminders toggle', () => {
    it('enables the pref and prompts for exact alarms when permission is granted', async () => {
      useAppPreferencesStore.setState({ medicationRemindersEnabled: false });
      const { getAllByRole } = renderScreen();

      fireEvent(
        getAllByRole('switch')[MEDICATION_SWITCH_INDEX],
        'valueChange',
        true
      );

      await waitFor(() => {
        expect(
          useAppPreferencesStore.getState().medicationRemindersEnabled
        ).toBe(true);
      });
      expect(mockMaybePrompt).toHaveBeenCalledTimes(1);
    });

    it('leaves the pref off and skips the exact-alarm prompt when permission is not granted', async () => {
      useAppPreferencesStore.setState({ medicationRemindersEnabled: false });
      mockRequestPermission.mockResolvedValue('denied');
      const { getAllByRole } = renderScreen();

      fireEvent(
        getAllByRole('switch')[MEDICATION_SWITCH_INDEX],
        'valueChange',
        true
      );

      await waitFor(() => {
        expect(mockRequestPermission).toHaveBeenCalled();
      });
      expect(useAppPreferencesStore.getState().medicationRemindersEnabled).toBe(
        false
      );
      expect(mockMaybePrompt).not.toHaveBeenCalled();
    });

    it('disables the pref without requesting permission or prompting', async () => {
      const { getAllByRole } = renderScreen();

      fireEvent(
        getAllByRole('switch')[MEDICATION_SWITCH_INDEX],
        'valueChange',
        false
      );

      await waitFor(() => {
        expect(
          useAppPreferencesStore.getState().medicationRemindersEnabled
        ).toBe(false);
      });
      expect(mockRequestPermission).not.toHaveBeenCalled();
      expect(mockMaybePrompt).not.toHaveBeenCalled();
    });
  });

  describe('water reminders', () => {
    // Found by label rather than index so the Hydration group's position
    // cannot shift it, and via role so the row's own label cannot collide.
    function waterSwitch(
      getAllByRole: ReturnType<typeof renderScreen>['getAllByRole']
    ) {
      const match = getAllByRole('switch').find(
        (element) => element.props.accessibilityLabel === 'Water Reminders'
      );
      if (!match) throw new Error('Water Reminders switch not rendered');
      return match;
    }

    it('hides the reminder options until water reminders are on', () => {
      const { queryByText } = renderScreen();
      expect(queryByText('Remind After')).toBeNull();
      expect(queryByText('Start Time')).toBeNull();
    });

    it('turns reminders on only after permission is granted', async () => {
      const { getAllByRole } = renderScreen();

      fireEvent(waterSwitch(getAllByRole), 'valueChange', true);

      await waitFor(() => {
        expect(useAppPreferencesStore.getState().waterReminderEnabled).toBe(
          true
        );
      });
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });

    it('leaves reminders off when permission is not granted', async () => {
      mockRequestPermission.mockResolvedValue('denied');
      const { getAllByRole } = renderScreen();

      fireEvent(waterSwitch(getAllByRole), 'valueChange', true);

      await waitFor(() => {
        expect(mockRequestPermission).toHaveBeenCalled();
      });
      expect(useAppPreferencesStore.getState().waterReminderEnabled).toBe(
        false
      );
    });

    it('turns reminders off without requesting permission', async () => {
      useAppPreferencesStore.setState({ waterReminderEnabled: true });
      const { getAllByRole } = renderScreen();

      fireEvent(waterSwitch(getAllByRole), 'valueChange', false);

      await waitFor(() => {
        expect(useAppPreferencesStore.getState().waterReminderEnabled).toBe(
          false
        );
      });
      expect(mockRequestPermission).not.toHaveBeenCalled();
    });

    it('selects the reminder interval', () => {
      useAppPreferencesStore.setState({ waterReminderEnabled: true });
      const { getByText } = renderScreen();

      fireEvent.press(getByText('3h'));

      expect(useAppPreferencesStore.getState().waterReminderIntervalHours).toBe(
        3
      );
    });

    it('saves a start time that stays before the end time', () => {
      useAppPreferencesStore.setState({ waterReminderEnabled: true });
      renderScreen();

      act(() => {
        latestTimeSheet('08:00').onSelectTime('07:00');
      });

      const state = useAppPreferencesStore.getState();
      expect(state.waterReminderWindowStart).toBe('07:00');
      expect(state.waterReminderWindowEnd).toBe('22:00');
    });

    it('rejects an end time that is not after the start time', () => {
      useAppPreferencesStore.setState({ waterReminderEnabled: true });
      renderScreen();

      act(() => {
        latestTimeSheet('22:00').onSelectTime('08:00');
      });

      expect(useAppPreferencesStore.getState().waterReminderWindowEnd).toBe(
        '22:00'
      );
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'End time must be after start time.',
        })
      );
    });
  });

  it('provides contextual accessibility labels for notification switches', () => {
    const { getAllByRole } = renderScreen();
    const switches = getAllByRole('switch');

    expect(switches[0].props.accessibilityLabel).toBe('Allow Notifications');
    expect(switches[1].props.accessibilityLabel).toBe('Rest Timer');
    expect(switches[2].props.accessibilityLabel).toBe('Fasting Goals');
    expect(switches[3].props.accessibilityLabel).toBe('Medication Reminders');
  });
});
