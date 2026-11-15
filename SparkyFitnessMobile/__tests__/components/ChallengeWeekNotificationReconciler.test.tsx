import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ChallengeWeekNotificationReconciler from '../../src/components/ChallengeWeekNotificationReconciler';
import {
  cancelChallengeWeekNotifications,
  scheduleChallengeWeekNotifications,
} from '../../src/services/challengeWeekNotificationService';
import { hasNotificationPermission } from '../../src/services/notifications';
import {
  fetchChallengeRuleChanges,
  fetchChallengeStandings,
  fetchChallenges,
  fetchChallengesStatus,
} from '../../src/services/api/challengesApi';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import { makeChallenge, makeStandings } from '../helpers/challengeFixtures';

jest.mock('../../src/services/challengeWeekNotificationService', () => ({
  cancelChallengeWeekNotifications: jest.fn(async () => undefined),
  scheduleChallengeWeekNotifications: jest.fn(async () => []),
}));

jest.mock('../../src/services/notifications', () => ({
  hasNotificationPermission: jest.fn(async () => true),
}));

jest.mock('../../src/services/api/challengesApi', () => ({
  fetchChallengesStatus: jest.fn(),
  fetchChallenges: jest.fn(),
  fetchChallengeStandings: jest.fn(),
  fetchChallengeRuleChanges: jest.fn(async () => []),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));

jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getTodayDate: () => '2026-11-14',
}));

const mockCancel = cancelChallengeWeekNotifications as jest.Mock;
const mockSchedule = scheduleChallengeWeekNotifications as jest.Mock;
const mockHasPermission = hasNotificationPermission as jest.Mock;
const mockStatus = fetchChallengesStatus as jest.Mock;
const mockList = fetchChallenges as jest.Mock;
const mockStandings = fetchChallengeStandings as jest.Mock;

function renderReconciler() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ChallengeWeekNotificationReconciler />
    </QueryClientProvider>
  );
}

describe('ChallengeWeekNotificationReconciler', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Only the clock is faked; React Query and waitFor keep real timers.
    jest.useFakeTimers({
      now: new Date(2026, 10, 14, 9, 0),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'hrtime',
        'performance',
      ],
    });
    __resetAppPreferencesStoreForTests();
    mockHasPermission.mockResolvedValue(true);
    mockStatus.mockResolvedValue({ enabled: true });
    mockList.mockResolvedValue([
      makeChallenge(),
      makeChallenge({
        id: 'monthly',
        rules: { version: 1, metric: 'distance', period: 'month' },
      }),
    ]);
    mockStandings.mockResolvedValue(makeStandings());
    (fetchChallengeRuleChanges as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules the weekly challenge for 8 PM on Sunday with who leads', async () => {
    renderReconciler();
    await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
    expect(mockStandings).toHaveBeenCalledTimes(1);
    expect(mockStandings).toHaveBeenCalledWith('c1', undefined);
    expect(mockSchedule).toHaveBeenLastCalledWith([
      expect.objectContaining({
        challengeId: 'c1',
        // 8 PM in the challenge's time zone (UTC in the fixture).
        fireAt: new Date(Date.UTC(2026, 10, 15, 20, 0, 0)),
        leaderName: 'Alex',
        leaderTotal: '400 pts',
        own: { rank: 2, total: '250 pts' },
      }),
    ]);
  });

  it('only cancels when turned off, and asks the server nothing', async () => {
    useAppPreferencesStore.setState({
      challengeWeekNotificationsEnabled: false,
    });
    renderReconciler();
    await waitFor(() => expect(mockCancel).toHaveBeenCalled());
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('schedules nothing on a server without Challenges', async () => {
    mockStatus.mockResolvedValue({ enabled: false });
    renderReconciler();
    await waitFor(() => expect(mockStatus).toHaveBeenCalled());
    await waitFor(() => expect(mockCancel).toHaveBeenCalled());
    expect(mockList).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('keeps what is scheduled when the standings could not be read', async () => {
    mockStandings.mockRejectedValue(new Error('offline'));
    renderReconciler();
    await waitFor(() => expect(mockStandings).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('shows totals in the units of the rules that score this week', async () => {
    const steps = makeChallenge().rules;
    mockList.mockResolvedValue([
      makeChallenge({
        // Saved mid-week; counts from next week.
        rules: { ...steps, metric: 'steps', points: null },
      }),
    ]);
    (fetchChallengeRuleChanges as jest.Mock).mockResolvedValue([
      {
        id: 'r1',
        changed_by_display_name: 'Alex',
        effective_from: '2026-11-02',
        rules: steps,
        previous_rules: null,
        created_at: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 'r2',
        changed_by_display_name: 'Alex',
        effective_from: '2026-11-16',
        rules: { ...steps, metric: 'steps', points: null },
        previous_rules: steps,
        created_at: '2026-11-12T00:00:00.000Z',
      },
    ]);
    renderReconciler();
    await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
    expect(mockSchedule).toHaveBeenLastCalledWith([
      expect.objectContaining({ leaderTotal: '400 pts' }),
    ]);
  });

  it('only cancels without notification permission', async () => {
    mockHasPermission.mockResolvedValue(false);
    renderReconciler();
    await waitFor(() => expect(mockStandings).toHaveBeenCalled());
    await waitFor(() => expect(mockHasPermission).toHaveBeenCalled());
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
