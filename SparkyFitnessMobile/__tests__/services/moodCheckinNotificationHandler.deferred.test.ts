import * as Notifications from 'expo-notifications';

import { initMoodCheckinNotificationResponses } from '../../src/services/moodCheckinNotificationHandler';
import { drainQuickActionNavigation } from '../../src/hooks/useQuickActions';
import { addNotificationResponseListener } from '../../src/services/notifications';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';

jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-quick-actions', () => ({
  setItems: jest.fn(() => Promise.resolve()),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  initial: undefined,
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/services/api/measurementsApi', () => ({
  changeWaterIntake: jest.fn(),
  fetchWaterContainers: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => false), navigate: jest.fn() },
}));

const mockIsReady = navigationRef.isReady as unknown as jest.Mock;
const mockNavigate = navigationRef.navigate as unknown as jest.Mock;

describe('mood check-in tap before the navigator is ready', () => {
  it('waits for the drain, then opens MoodLog once', () => {
    initMoodCheckinNotificationResponses();
    const listener = (addNotificationResponseListener as jest.Mock).mock
      .calls[0][0];

    listener({
      actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
      notification: {
        date: 1,
        request: {
          identifier: 'cold',
          content: { data: { kind: 'mood-checkin' } },
        },
      },
    });
    expect(mockNavigate).not.toHaveBeenCalled();

    mockIsReady.mockReturnValue(true);
    drainQuickActionNavigation();
    drainQuickActionNavigation();

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('MoodLog');
  });
});
