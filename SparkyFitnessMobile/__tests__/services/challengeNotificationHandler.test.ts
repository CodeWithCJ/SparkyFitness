import * as Notifications from 'expo-notifications';

import { initChallengeNotificationResponses } from '../../src/services/challengeNotificationHandler';
import { addNotificationResponseListener } from '../../src/services/notifications';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';
import { CHALLENGE_WEEK_LEADER_KIND } from '../../src/utils/challenges';

jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));

jest.mock('../../src/hooks/useQuickActions', () => ({
  whenNavigationReady: (run: () => void) => run(),
}));

const mockAddListener = addNotificationResponseListener as jest.Mock;
const mockNavigate = navigationRef.navigate as unknown as jest.Mock;
const mockGetLast = Notifications.getLastNotificationResponse as jest.Mock;
const mockClearLast = Notifications.clearLastNotificationResponse as jest.Mock;

let nextId = 0;
function response(data: Record<string, unknown>, action?: string) {
  return {
    actionIdentifier: action ?? Notifications.DEFAULT_ACTION_IDENTIFIER,
    notification: {
      date: 1000,
      request: { identifier: `n-${nextId++}`, content: { data } },
    },
  };
}

describe('initChallengeNotificationResponses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddListener.mockReturnValue({ remove: jest.fn() });
    mockGetLast.mockReturnValue(null);
  });

  it('opens the challenge when its week notification is tapped', () => {
    initChallengeNotificationResponses();
    const listener = mockAddListener.mock.calls[0][0];
    expect(
      listener(
        response({ kind: CHALLENGE_WEEK_LEADER_KIND, challengeId: 'c1' })
      )
    ).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('ChallengeDetail', { id: 'c1' });
  });

  it('ignores other notifications and other actions', () => {
    initChallengeNotificationResponses();
    const listener = mockAddListener.mock.calls[0][0];
    expect(listener(response({ kind: 'mood-checkin' }))).toBe(false);
    expect(
      listener(
        response(
          { kind: CHALLENGE_WEEK_LEADER_KIND, challengeId: 'c1' },
          'dismiss'
        )
      )
    ).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('handles the tap that launched the app once', () => {
    mockGetLast.mockReturnValue(
      response({ kind: CHALLENGE_WEEK_LEADER_KIND, challengeId: 'c9' })
    );
    initChallengeNotificationResponses();
    expect(mockNavigate).toHaveBeenCalledWith('ChallengeDetail', { id: 'c9' });
    expect(mockClearLast).toHaveBeenCalled();
  });
});
