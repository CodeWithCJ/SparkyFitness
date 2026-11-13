import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import MoodCheckinReminderReconciler from '../../src/components/MoodCheckinReminderReconciler';
import {
  cancelMoodCheckinReminders,
  scheduleMoodCheckinReminders,
} from '../../src/services/moodCheckinReminderService';
import { hasNotificationPermission } from '../../src/services/notifications';
import i18n from '../../src/localization/i18n';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/moodCheckinReminderService', () => ({
  cancelMoodCheckinReminders: jest.fn(async () => undefined),
  scheduleMoodCheckinReminders: jest.fn(async () => []),
}));

jest.mock('../../src/services/notifications', () => ({
  hasNotificationPermission: jest.fn(async () => true),
}));

const mockCancel = cancelMoodCheckinReminders as jest.Mock;
const mockSchedule = scheduleMoodCheckinReminders as jest.Mock;
const mockHasPermission = hasNotificationPermission as jest.Mock;

describe('MoodCheckinReminderReconciler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockHasPermission.mockResolvedValue(true);
  });

  it('renders nothing and cancels then schedules when enabled with permission', async () => {
    useAppPreferencesStore.setState({
      checkinRemindersEnabled: true,
      checkinReminderTimes: ['08:00', '20:30'],
      notificationsEnabled: true,
    });

    const { toJSON } = render(<MoodCheckinReminderReconciler />);

    await waitFor(() =>
      expect(mockSchedule).toHaveBeenCalledWith(['08:00', '20:30'])
    );
    expect(toJSON()).toBeNull();
    expect(mockCancel.mock.invocationCallOrder[0]).toBeLessThan(
      mockSchedule.mock.invocationCallOrder[0]
    );
  });

  it.each([
    ['reminders disabled', { checkinRemindersEnabled: false }],
    ['master toggle off', { notificationsEnabled: false }],
  ])('only cancels when %s', async (_name, state) => {
    useAppPreferencesStore.setState({
      checkinRemindersEnabled: true,
      notificationsEnabled: true,
      ...state,
    });

    render(<MoodCheckinReminderReconciler />);

    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('only cancels without notification permission', async () => {
    mockHasPermission.mockResolvedValue(false);
    useAppPreferencesStore.setState({
      checkinRemindersEnabled: true,
      notificationsEnabled: true,
    });

    render(<MoodCheckinReminderReconciler />);

    await waitFor(() => expect(mockHasPermission).toHaveBeenCalled());
    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('reschedules with one time after shrinking from three', async () => {
    useAppPreferencesStore.setState({
      checkinRemindersEnabled: true,
      checkinReminderTimes: ['08:00', '12:00', '20:30'],
      notificationsEnabled: true,
    });
    render(<MoodCheckinReminderReconciler />);
    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));

    act(() => {
      useAppPreferencesStore.setState({ checkinReminderTimes: ['20:30'] });
    });

    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(2));
    expect(mockCancel).toHaveBeenCalledTimes(2);
    expect(mockSchedule).toHaveBeenLastCalledWith(['20:30']);
    expect(mockCancel.mock.invocationCallOrder[1]).toBeLessThan(
      mockSchedule.mock.invocationCallOrder[1]
    );
  });

  it('reschedules when the language changes', async () => {
    useAppPreferencesStore.setState({
      checkinRemindersEnabled: true,
      checkinReminderTimes: ['20:30'],
      notificationsEnabled: true,
    });
    render(<MoodCheckinReminderReconciler />);
    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));

    act(() => {
      i18n.emit('languageChanged', 'fr');
    });

    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(2));
    expect(mockCancel).toHaveBeenCalledTimes(2);
  });
});
