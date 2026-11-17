import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import OralCareReminderReconciler from '../../src/components/OralCareReminderReconciler';
import {
  cancelOralCareReminders,
  scheduleOralCareReminders,
} from '../../src/services/oralCareReminderService';
import { hasNotificationPermission } from '../../src/services/notifications';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/oralCareReminderService', () => ({
  cancelOralCareReminders: jest.fn(async () => undefined),
  scheduleOralCareReminders: jest.fn(async () => []),
}));

jest.mock('../../src/services/notifications', () => ({
  hasNotificationPermission: jest.fn(async () => true),
}));

const mockCancel = cancelOralCareReminders as jest.Mock;
const mockSchedule = scheduleOralCareReminders as jest.Mock;
const mockHasPermission = hasNotificationPermission as jest.Mock;

describe('OralCareReminderReconciler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockHasPermission.mockResolvedValue(true);
  });

  it('is off by default and schedules nothing', async () => {
    useAppPreferencesStore.setState({ notificationsEnabled: true });
    render(<OralCareReminderReconciler />);
    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('cancels then schedules the brushing times when on with permission', async () => {
    useAppPreferencesStore.setState({
      oralCareRemindersEnabled: true,
      oralCareReminderTimes: ['07:30', '21:15'],
      notificationsEnabled: true,
    });
    render(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockSchedule).toHaveBeenCalledWith(['07:30', '21:15'])
    );
    expect(mockCancel.mock.invocationCallOrder[0]).toBeLessThan(
      mockSchedule.mock.invocationCallOrder[0]
    );
  });

  it('only cancels without notification permission', async () => {
    mockHasPermission.mockResolvedValue(false);
    useAppPreferencesStore.setState({
      oralCareRemindersEnabled: true,
      notificationsEnabled: true,
    });
    render(<OralCareReminderReconciler />);
    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
