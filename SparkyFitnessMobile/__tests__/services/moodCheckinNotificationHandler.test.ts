import * as Notifications from 'expo-notifications';

import { initMoodCheckinNotificationResponses } from '../../src/services/moodCheckinNotificationHandler';
import { addNotificationResponseListener } from '../../src/services/notifications';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';

jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));

jest.mock('../../src/hooks/useQuickActions', () => {
  const { navigationRef: ref } = jest.requireMock(
    '../../src/components/ActiveWorkoutBar'
  );
  return {
    whenNavigationReady: (run: () => void) => {
      if (ref.isReady()) run();
    },
  };
});

const mockAddListener = addNotificationResponseListener as jest.Mock;
const mockNavigate = navigationRef.navigate as unknown as jest.Mock;
const mockGetLast = Notifications.getLastNotificationResponse as jest.Mock;
const mockClearLast = Notifications.clearLastNotificationResponse as jest.Mock;

let nextId = 0;
function response(actionIdentifier: string, kind?: string, id?: string) {
  return {
    actionIdentifier,
    notification: {
      date: 1000,
      request: {
        identifier: id ?? `notif-${nextId++}`,
        content: { data: kind ? { kind } : {} },
      },
    },
  };
}

describe('initMoodCheckinNotificationResponses', () => {
  let remove: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    remove = jest.fn();
    mockAddListener.mockReturnValue({ remove });
    mockGetLast.mockReturnValue(null);
  });

  function listener(): (r: unknown) => void {
    initMoodCheckinNotificationResponses();
    return mockAddListener.mock.calls[0][0];
  }

  it('opens MoodLog when a mood check-in reminder is tapped', () => {
    listener()(
      response(Notifications.DEFAULT_ACTION_IDENTIFIER, 'mood-checkin')
    );
    expect(mockNavigate).toHaveBeenCalledWith('MoodLog');
  });

  it('ignores other notification kinds', () => {
    listener()(response(Notifications.DEFAULT_ACTION_IDENTIFIER, 'water'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ignores non-default actions', () => {
    listener()(response('SOME_ACTION', 'mood-checkin'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('handles and clears the response that launched the app', () => {
    mockGetLast.mockReturnValue(
      response(Notifications.DEFAULT_ACTION_IDENTIFIER, 'mood-checkin')
    );
    initMoodCheckinNotificationResponses();
    expect(mockNavigate).toHaveBeenCalledWith('MoodLog');
    expect(mockClearLast).toHaveBeenCalled();
  });

  it('opens the check-in once when the same tap arrives twice', () => {
    const tap = response(
      Notifications.DEFAULT_ACTION_IDENTIFIER,
      'mood-checkin',
      'launch-tap'
    );
    mockGetLast.mockReturnValue(tap);
    const handle = listener();
    handle(tap);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('opens the check-in again for the same reminder on a later day', () => {
    const handle = listener();
    const first = response(
      Notifications.DEFAULT_ACTION_IDENTIFIER,
      'mood-checkin',
      'mood_checkin_0'
    );
    const nextDay = {
      ...first,
      notification: { ...first.notification, date: 1000 + 86400 },
    };
    handle(first);
    handle(nextDay);
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });

  it('does not clear a launch response of another kind', () => {
    mockGetLast.mockReturnValue(
      response(Notifications.DEFAULT_ACTION_IDENTIFIER, 'water')
    );
    initMoodCheckinNotificationResponses();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockClearLast).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe function', () => {
    initMoodCheckinNotificationResponses()();
    expect(remove).toHaveBeenCalled();
  });
});
