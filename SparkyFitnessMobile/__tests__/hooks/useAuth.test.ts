import { renderHook, act } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { useAuth } from '../../src/hooks/useAuth';
import {
  clearAuthCookies,
  setOnSessionExpired,
  setOnNoConfigs,
  setOnIdentityChanged,
  suppressSessionExpired,
} from '../../src/services/api/authService';
import { clearServerConfigCache } from '../../src/services/storage';
import { clearBackgroundWater } from '../../src/services/backgroundWater';
import { clearAndroidWidgetSnapshots } from '../../src/services/androidWidgetSyncService';
import { clearGarminAccount } from '../../src/services/garminSync';
import { addLog } from '../../src/services/LogService';
import {
  cancelChallengeWeekNotifications,
  dismissDeliveredChallengeWeekNotifications,
  enqueueChallengeWeekNotificationTask,
} from '../../src/services/challengeWeekNotificationService';
import { cancelMedicationRemindersForAccountChange } from '../../src/services/medicationReminderService';
import { beginAccountChange } from '../../src/offline/accountGeneration';
import { subscribeAccountChanged } from '../../src/offline/events';
import { useGuidedCheckInStore } from '../../src/stores/guidedCheckInStore';
import type { ServerConfig } from '../../src/services/storage';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';
import type { QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/authService', () => ({
  clearAuthCookies: jest.fn().mockResolvedValue(true),
  setOnSessionExpired: jest.fn(),
  setOnNoConfigs: jest.fn(),
  setOnIdentityChanged: jest.fn(),
  suppressSessionExpired: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  clearServerConfigCache: jest.fn(),
  setOnServerConfigDeleted: jest.fn(),
  setOnServerConfigsChanged: jest.fn(),
  takeIdentityChangeServerConfigIds: jest.fn(async () => []),
}));

jest.mock('../../src/services/clientCertificate', () => ({
  refreshClientCertificateHosts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-image', () => ({
  Image: {
    clearMemoryCache: jest.fn().mockResolvedValue(true),
    clearDiskCache: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../src/services/backgroundWater', () => ({
  clearBackgroundWater: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/androidWidgetSyncService', () => ({
  clearAndroidWidgetSnapshots: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/garminSync', () => ({
  clearGarminAccount: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

// The offline file is the phone's own SQLite; these tests are about what the
// identity change does around it, so it is replaced here.
const mockClearAllCache = jest.fn();
jest.mock('../../src/offline/db', () => ({
  getOfflineDb: jest.fn(async () => ({})),
}));
jest.mock('../../src/offline/cacheStore', () => ({
  clearAllCache: (...args: unknown[]) => mockClearAllCache(...args),
}));
jest.mock('../../src/offline/offlineImages', () => ({
  clearAllOfflineImages: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/offline/accountGeneration', () => {
  const actual = jest.requireActual('../../src/offline/accountGeneration');
  return {
    ...actual,
    beginAccountChange: jest.fn(actual.beginAccountChange),
  };
});
jest.mock('../../src/services/medicationReminderService', () => ({
  cancelMedicationRemindersForAccountChange: jest
    .fn()
    .mockResolvedValue(undefined),
}));
jest.mock('../../src/services/challengeWeekNotificationService', () => ({
  cancelChallengeWeekNotifications: jest.fn().mockResolvedValue(true),
  dismissDeliveredChallengeWeekNotifications: jest
    .fn()
    .mockResolvedValue(undefined),
  enqueueChallengeWeekNotificationTask: jest.fn(
    async (task: () => Promise<unknown>) => {
      await task();
    }
  ),
}));

const mockSetOnSessionExpired = setOnSessionExpired as jest.MockedFunction<
  typeof setOnSessionExpired
>;
const mockSetOnNoConfigs = setOnNoConfigs as jest.MockedFunction<
  typeof setOnNoConfigs
>;
const mockSetOnIdentityChanged = setOnIdentityChanged as jest.MockedFunction<
  typeof setOnIdentityChanged
>;
const mockClearServerConfigCache =
  clearServerConfigCache as jest.MockedFunction<typeof clearServerConfigCache>;
const mockSuppressSessionExpired =
  suppressSessionExpired as jest.MockedFunction<typeof suppressSessionExpired>;
const mockClearMemoryCache = Image.clearMemoryCache as jest.MockedFunction<
  typeof Image.clearMemoryCache
>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockClearDiskCache = Image.clearDiskCache as jest.MockedFunction<
  typeof Image.clearDiskCache
>;
const mockClearAuthCookies = clearAuthCookies as jest.MockedFunction<
  typeof clearAuthCookies
>;

describe('useAuth', () => {
  let queryClient: QueryClient;

  // The hook reads the query client to drop caches on an identity change, so
  // every render needs a provider around it.
  const renderUseAuth = () =>
    renderHook(() => useAuth(), { wrapper: createQueryWrapper(queryClient) });

  beforeEach(() => {
    mockClearAllCache.mockReset();
    mockClearAllCache.mockResolvedValue(undefined);
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  test('does not auto-show any modal on mount', async () => {
    const { result } = renderUseAuth();

    await act(async () => {});

    expect(result.current.showSetupModal).toBe(false);
    expect(result.current.showReauthModal).toBe(false);
    expect(result.current.authModalReason).toBeNull();
  });

  test('registers callbacks on mount', async () => {
    renderUseAuth();

    await act(async () => {});

    expect(mockSetOnSessionExpired).toHaveBeenCalledTimes(1);
    expect(mockSetOnSessionExpired).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSetOnNoConfigs).toHaveBeenCalledTimes(1);
    expect(mockSetOnNoConfigs).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSetOnIdentityChanged).toHaveBeenCalledTimes(1);
    expect(mockSetOnIdentityChanged).toHaveBeenCalledWith(expect.any(Function));
  });

  test('keeps the client certificate hosts in step with the saved servers', async () => {
    const { setOnServerConfigsChanged } = jest.requireMock(
      '../../src/services/storage'
    ) as { setOnServerConfigsChanged: jest.Mock };
    const { refreshClientCertificateHosts } = jest.requireMock(
      '../../src/services/clientCertificate'
    ) as { refreshClientCertificateHosts: jest.Mock };
    renderUseAuth();

    await act(async () => {});

    // Once at start, for servers saved before this build.
    expect(refreshClientCertificateHosts).toHaveBeenCalledTimes(1);
    const onChanged = setOnServerConfigsChanged.mock.calls[0][0] as () => void;
    onChanged();
    expect(refreshClientCertificateHosts).toHaveBeenCalledTimes(2);
  });

  test('identity changed callback drops every cached query', async () => {
    renderUseAuth();
    await act(async () => {});

    queryClient.setQueryData(['dailySummary', '2026-01-01'], {
      calories: 1800,
    });
    queryClient.setQueryData(['measurements', '2026-01-01'], { weight: 70 });

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    act(() => {
      identityChangedCb();
    });

    expect(
      queryClient.getQueryData(['dailySummary', '2026-01-01'])
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(['measurements', '2026-01-01'])
    ).toBeUndefined();
  });

  test('identity changed callback erases the shortcut login copy', async () => {
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    expect(clearBackgroundWater).toHaveBeenCalledTimes(1);
  });

  test("identity changed callback forgets the previous account's guided check-in in progress", async () => {
    useGuidedCheckInStore.getState().saveProgress({
      date: '2026-10-26',
      step: 'MeasurementsAdd',
      flags: {
        saved: true,
        offerReminders: true,
        moodCheckin: { id: 'checkin-1', date: '2026-10-26' },
      },
    });
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    expect(useGuidedCheckInStore.getState().progress).toBeNull();
  });

  test('identity changed callback erases the widget snapshots once the cache is gone', async () => {
    renderUseAuth();
    await act(async () => {});

    queryClient.setQueryData(['dailySummary', '2026-01-01'], {
      calories: 1800,
    });
    let queriesLeftAtClear: number | null = null;
    (clearAndroidWidgetSnapshots as jest.Mock).mockImplementationOnce(
      async () => {
        queriesLeftAtClear = queryClient.getQueryCache().getAll().length;
      }
    );

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    // The Quick Settings tile shows the calorie figure on the lock screen, and
    // the snapshot carries no account. Cleared after the cache, so a summary of
    // the previous account cannot be pushed again behind it.
    expect(clearAndroidWidgetSnapshots).toHaveBeenCalledTimes(1);
    expect(queriesLeftAtClear).toBe(0);
  });

  test('a failed widget snapshot clear is logged and the rest still runs', async () => {
    (clearAndroidWidgetSnapshots as jest.Mock).mockRejectedValueOnce(
      new Error('no module')
    );
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('widget snapshots'),
      'WARNING'
    );
    expect(clearBackgroundWater).toHaveBeenCalledTimes(1);
    expect(mockClearAuthCookies).toHaveBeenCalledTimes(1);
  });

  test('identity changed callback clears the Garmin watches, with no server needed', async () => {
    renderUseAuth();
    await act(async () => {});
    expect(clearGarminAccount).not.toHaveBeenCalled();

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    // The watches and the phone's replay copy hold the previous account's
    // figures; the next context push runs only once a server answers.
    expect(clearGarminAccount).toHaveBeenCalledTimes(1);
  });

  test('a failed Garmin clear is logged and the rest still runs', async () => {
    (clearGarminAccount as jest.Mock).mockRejectedValueOnce(
      new Error('no module')
    );
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    expect(mockAddLog).toHaveBeenCalledWith(
      'Failed to clear the Garmin watches: Error: no module',
      'WARNING'
    );
    expect(clearBackgroundWater).toHaveBeenCalledTimes(1);
    expect(mockClearAuthCookies).toHaveBeenCalledTimes(1);
  });

  test("identity changed callback cancels and dismisses the previous account's challenge week notices in their queue", async () => {
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    expect(enqueueChallengeWeekNotificationTask).toHaveBeenCalledTimes(1);
    expect(cancelChallengeWeekNotifications).toHaveBeenCalledTimes(1);
    expect(dismissDeliveredChallengeWeekNotifications).toHaveBeenCalledTimes(1);
  });

  test("identity changed callback cancels the previous account's medication reminders before it waits on the account change", async () => {
    let finishAccountChange: () => void = () => {};
    (beginAccountChange as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishAccountChange = resolve;
        })
    );
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = identityChangedCb();
    });

    // Queued before the first await, so the new account's reconcile comes
    // after it.
    expect(cancelMedicationRemindersForAccountChange).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishAccountChange();
      await done;
    });
  });

  test('identity changed callback tells the app the account changed only once the cookies are cleared', async () => {
    let finishCookieSweep: (cleared: boolean) => void = () => {};
    mockClearAuthCookies.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishCookieSweep = resolve;
        })
    );
    const listener = jest.fn();
    const unsubscribe = subscribeAccountChanged(listener);
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    let done: Promise<void> = Promise.resolve();
    await act(async () => {
      done = identityChangedCb();
    });

    // Still clearing the previous session's cookies: the reconciler must not
    // read the new account yet.
    expect(listener).not.toHaveBeenCalled();
    await act(async () => {
      finishCookieSweep(true);
      await done;
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('identity changed callback queues the challenge week cancel before it waits on the account change', async () => {
    let finishAccountChange: () => void = () => {};
    (beginAccountChange as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishAccountChange = resolve;
        })
    );
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    let done: Promise<void> = Promise.resolve();
    await act(async () => {
      done = identityChangedCb() as Promise<void>;
    });
    // Still waiting on the account change, and the cancel is already queued.
    expect(enqueueChallengeWeekNotificationTask).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishAccountChange();
      await done;
    });
  });

  test('identity changed callback drops the image caches', async () => {
    renderUseAuth();
    await act(async () => {});

    expect(mockClearMemoryCache).not.toHaveBeenCalled();
    expect(mockClearDiskCache).not.toHaveBeenCalled();

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      identityChangedCb();
    });

    // Dropping the queries leaves the bytes themselves in expo-image's caches,
    // so a departed account's progress photos would stay on the device.
    expect(mockClearMemoryCache).toHaveBeenCalledTimes(1);
    expect(mockClearDiskCache).toHaveBeenCalledTimes(1);
  });

  test('identity changed callback waits for the offline cache to be cleared, trying again if it fails', async () => {
    mockClearAllCache
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockResolvedValue(undefined);
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    expect(mockClearAllCache).toHaveBeenCalledTimes(2);
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('Failed to clear offline data (attempt 1 of 3)'),
      'ERROR'
    );
    // The rest of the identity change still runs.
    expect(mockClearAuthCookies).toHaveBeenCalledTimes(1);
  });

  test('identity changed callback reports a cache clear that keeps failing and carries on', async () => {
    mockClearAllCache.mockRejectedValue(new Error('disk full'));
    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    expect(mockClearAllCache).toHaveBeenCalledTimes(3);
    expect(mockClearAuthCookies).toHaveBeenCalledTimes(1);
  });

  test('identity changed callback drops the cookie jar', async () => {
    renderUseAuth();
    await act(async () => {});

    expect(mockClearAuthCookies).not.toHaveBeenCalled();

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    // The native cookie jar is keyed by host, so two accounts on one server
    // share it. Left in place, the server resolves the previous account's
    // session cookie ahead of the Bearer token and answers as that account.
    expect(mockClearAuthCookies).toHaveBeenCalledTimes(1);
  });

  test('identity change does not settle until the cookies are gone', async () => {
    let releaseCookieClear: () => void = () => {};
    mockClearAuthCookies.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseCookieClear = resolve;
      })
    );

    renderUseAuth();
    await act(async () => {});

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    let settled = false;
    const pending = Promise.resolve(identityChangedCb()).then(() => {
      settled = true;
    });

    // Callers await this before refetching. Resolving early would let the next
    // request overtake the sweep and go out carrying the old session cookie,
    // which is the whole failure this guards against.
    await act(async () => {});
    expect(settled).toBe(false);

    releaseCookieClear();
    await act(async () => {
      await pending;
    });
    expect(settled).toBe(true);
  });

  test('a cookie jar that could not be cleared is reported', async () => {
    // The native sweep can fail without throwing: no Networking module, or a
    // missing WebView provider leaving the callback uncalled. Passing that over
    // would leave the previous account's session cookie on the wire silently.
    mockClearAuthCookies.mockResolvedValueOnce(false);

    renderUseAuth();
    await act(async () => {});
    mockAddLog.mockClear();

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('cookie jar was not cleared'),
      'ERROR'
    );
  });

  test('a cleared cookie jar reports nothing', async () => {
    renderUseAuth();
    await act(async () => {});
    mockAddLog.mockClear();

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      await identityChangedCb();
    });

    expect(mockAddLog).not.toHaveBeenCalledWith(
      expect.stringContaining('cookie jar'),
      'ERROR'
    );
  });

  test('a rejected image cache clear is reported, not swallowed', async () => {
    mockClearMemoryCache.mockRejectedValueOnce(new Error('no activity'));
    mockClearDiskCache.mockRejectedValueOnce(new Error('no activity'));

    renderUseAuth();
    await act(async () => {});
    mockAddLog.mockClear();

    const identityChangedCb = mockSetOnIdentityChanged.mock.calls[0][0];
    await act(async () => {
      // The sign-in that triggered this must not fail because a cache sweep did.
      expect(() => identityChangedCb()).not.toThrow();
    });

    // A failure leaves the previous account's images on disk, so it has to be
    // visible in the logs rather than disappearing into an empty catch.
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('image memory cache'),
      'WARNING'
    );
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('image disk cache'),
      'WARNING'
    );
  });

  test('session expired callback shows reauth modal with config ID', async () => {
    const { result } = renderUseAuth();
    await act(async () => {});

    const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
    act(() => {
      sessionExpiredCb('config-42');
    });

    expect(result.current.showReauthModal).toBe(true);
    expect(result.current.showSetupModal).toBe(false);
    expect(result.current.authModalReason).toBe('session_expired');
    expect(result.current.expiredConfigId).toBe('config-42');
  });

  test('session expired clears config cache on first trigger', async () => {
    const { result } = renderUseAuth();
    await act(async () => {});

    expect(result.current.showReauthModal).toBe(false);
    mockClearServerConfigCache.mockClear();

    const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
    act(() => {
      sessionExpiredCb('config-42');
    });

    expect(mockClearServerConfigCache).toHaveBeenCalledTimes(1);
  });

  test('no-configs callback shows setup modal', async () => {
    const { result } = renderUseAuth();
    await act(async () => {});
    expect(result.current.showSetupModal).toBe(false);

    const noConfigsCb = mockSetOnNoConfigs.mock.calls[0][0];
    act(() => {
      noConfigsCb();
    });

    expect(result.current.showSetupModal).toBe(true);
    expect(result.current.authModalReason).toBe('no_configs');
  });

  test('dismissModal resets state', async () => {
    const { result } = renderUseAuth();
    await act(async () => {});

    const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
    act(() => {
      sessionExpiredCb('config-42');
    });
    expect(result.current.showReauthModal).toBe(true);
    expect(result.current.expiredConfigId).toBe('config-42');

    act(() => {
      result.current.dismissModal();
    });

    expect(result.current.showReauthModal).toBe(false);
    expect(result.current.showSetupModal).toBe(false);
    expect(result.current.authModalReason).toBeNull();
    expect(result.current.expiredConfigId).toBeNull();
  });

  test('handleLoginSuccess resets state', async () => {
    const { result } = renderUseAuth();
    await act(async () => {});

    const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
    act(() => {
      sessionExpiredCb('config-42');
    });
    expect(result.current.showReauthModal).toBe(true);

    act(() => {
      result.current.handleLoginSuccess();
    });

    expect(result.current.showReauthModal).toBe(false);
    expect(result.current.showSetupModal).toBe(false);
    expect(result.current.authModalReason).toBeNull();
    expect(result.current.expiredConfigId).toBeNull();
  });

  describe('switchToApiKey flow', () => {
    const expiredConfig: ServerConfig = {
      id: 'cfg-1',
      url: 'https://example.com',
      apiKey: '',
      authType: 'session',
      sessionToken: 'old-tok',
    };

    test('handleSwitchToApiKey hides reauth modal and exposes config', async () => {
      const { result } = renderUseAuth();
      await act(async () => {});

      // Trigger session expired first
      const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
      act(() => {
        sessionExpiredCb('cfg-1');
      });
      expect(result.current.showReauthModal).toBe(true);

      // Switch to API key
      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });

      expect(result.current.showReauthModal).toBe(false);
      expect(result.current.showApiKeySwitchModal).toBe(true);
      expect(result.current.switchToApiKeyConfig).toBe(expiredConfig);
      expect(result.current.expiredConfigId).toBeNull();
    });

    test('handleSwitchToApiKey keeps suppression active', async () => {
      const { result } = renderUseAuth();
      await act(async () => {});

      const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
      act(() => {
        sessionExpiredCb('cfg-1');
      });
      mockSuppressSessionExpired.mockClear();

      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });

      // Should NOT call suppressSessionExpired(false)
      expect(mockSuppressSessionExpired).not.toHaveBeenCalled();
    });

    test('handleSwitchToApiKeyDone clears state and unsuppresses', async () => {
      const { result } = renderUseAuth();
      await act(async () => {});

      const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
      act(() => {
        sessionExpiredCb('cfg-1');
      });
      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });
      expect(result.current.showApiKeySwitchModal).toBe(true);

      mockSuppressSessionExpired.mockClear();
      act(() => {
        result.current.handleSwitchToApiKeyDone();
      });

      expect(result.current.showApiKeySwitchModal).toBe(false);
      expect(result.current.switchToApiKeyConfig).toBeNull();
      expect(mockSuppressSessionExpired).toHaveBeenCalledWith(false);
    });

    test('session expired callback clears switchToApiKeyConfig', async () => {
      const { result } = renderUseAuth();
      await act(async () => {});

      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });
      expect(result.current.showApiKeySwitchModal).toBe(true);

      // Simulate another session expired event
      const sessionExpiredCb = mockSetOnSessionExpired.mock.calls[0][0];
      act(() => {
        sessionExpiredCb('cfg-1');
      });

      expect(result.current.showApiKeySwitchModal).toBe(false);
      expect(result.current.showReauthModal).toBe(true);
    });

    test('no-configs callback clears switchToApiKeyConfig', async () => {
      const { result } = renderUseAuth();
      await act(async () => {});

      act(() => {
        result.current.handleSwitchToApiKey(expiredConfig);
      });
      expect(result.current.showApiKeySwitchModal).toBe(true);

      const noConfigsCb = mockSetOnNoConfigs.mock.calls[0][0];
      act(() => {
        noConfigsCb();
      });

      expect(result.current.showApiKeySwitchModal).toBe(false);
      expect(result.current.showSetupModal).toBe(true);
    });
  });
});
