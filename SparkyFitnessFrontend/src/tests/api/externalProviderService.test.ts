import { apiCall, HttpApiError } from '@/api/api';
import {
  createExternalProvider,
  updateExternalProvider,
  GOOGLE_HEALTH_SYNC_POLL_MS,
  GOOGLE_HEALTH_SYNC_TIMEOUT_MS,
  handleManualSyncGoogleHealth,
} from '@/api/Settings/externalProviderService';

jest.mock('@/api/api', () => ({
  ...jest.requireActual('@/api/api'),
  apiCall: jest.fn(),
}));

describe('createExternalProvider', () => {
  it.each(['manual', 'hourly', 'daily'] as const)(
    'persists the selected Hevy frequency %s',
    async (frequency) => {
      jest.mocked(apiCall).mockResolvedValue({
        id: 'hevy-1',
        provider_type: 'hevy',
        is_active: true,
      });

      await createExternalProvider({
        user_id: 'user-1',
        provider_name: 'My Hevy',
        provider_type: 'hevy',
        app_key: 'test-key',
        is_active: true,
        sync_frequency: frequency,
      });

      expect(apiCall).toHaveBeenLastCalledWith('/external-providers', {
        method: 'POST',
        body: JSON.stringify({
          user_id: 'user-1',
          provider_name: 'My Hevy',
          provider_type: 'hevy',
          app_id: null,
          app_key: 'test-key',
          is_active: true,
          base_url: null,
          sync_frequency: frequency,
        }),
      });
    }
  );

  it('keeps Open Food Facts contribution consent out of provider credentials', async () => {
    jest.mocked(apiCall).mockResolvedValue({
      id: 'provider-1',
      provider_type: 'openfoodfacts',
      is_active: true,
    });

    await createExternalProvider({
      user_id: 'user-1',
      provider_name: 'My Open Food Facts account',
      provider_type: 'openfoodfacts',
      app_id: 'test-user',
      app_key: 'test-password',
      is_active: true,
      base_url: 'https://world.openfoodfacts.org',
    });

    expect(apiCall).toHaveBeenCalledWith('/external-providers', {
      method: 'POST',
      body: JSON.stringify({
        user_id: 'user-1',
        provider_name: 'My Open Food Facts account',
        provider_type: 'openfoodfacts',
        app_id: 'test-user',
        app_key: 'test-password',
        is_active: true,
        base_url: 'https://world.openfoodfacts.org',
        sync_frequency: null,
      }),
    });
  });
});

describe('updateExternalProvider', () => {
  it.each(['manual', 'hourly', 'daily'] as const)(
    'sends the selected Hevy frequency %s when editing',
    async (frequency) => {
      await updateExternalProvider('hevy-1', {
        provider_type: 'hevy',
        sync_frequency: frequency,
      });

      expect(apiCall).toHaveBeenLastCalledWith('/external-providers/hevy-1', {
        method: 'PUT',
        body: JSON.stringify({
          provider_type: 'hevy',
          sync_frequency: frequency,
        }),
      });
    }
  );
});

describe('handleManualSyncGoogleHealth', () => {
  const STATUS = '/integrations/googlehealth/status';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(apiCall).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockLastSyncAt = (values: (string | null | Error)[]) => {
    let statusCalls = 0;
    jest.mocked(apiCall).mockImplementation(async (endpoint: string) => {
      if (endpoint === STATUS) {
        const value = values[Math.min(statusCalls, values.length - 1)];
        statusCalls += 1;
        if (value instanceof Error) throw value;
        return { lastSyncAt: value };
      }
      return { message: 'Google Health sync started.' };
    });
  };

  it('resolves only after last_sync_at changes', async () => {
    mockLastSyncAt([
      '2026-10-04T10:00:00Z',
      '2026-10-04T10:00:00Z',
      '2026-10-04T10:05:00Z',
    ]);
    let settled = false;
    const sync = handleManualSyncGoogleHealth('2026-10-01', '2026-10-04').then(
      () => {
        settled = true;
      }
    );

    await jest.advanceTimersByTimeAsync(GOOGLE_HEALTH_SYNC_POLL_MS);
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(GOOGLE_HEALTH_SYNC_POLL_MS);
    await sync;
    expect(settled).toBe(true);
    expect(apiCall).toHaveBeenCalledWith('/integrations/googlehealth/sync', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2026-10-01', endDate: '2026-10-04' }),
    });
  });

  it('treats a first-ever sync as finished once last_sync_at is set', async () => {
    mockLastSyncAt([null, '2026-10-04T10:05:00Z']);
    const sync = handleManualSyncGoogleHealth();

    await jest.advanceTimersByTimeAsync(GOOGLE_HEALTH_SYNC_POLL_MS);
    await expect(sync).resolves.toBeUndefined();
  });

  it('keeps waiting through a failed status check', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLastSyncAt([
      '2026-10-04T10:00:00Z',
      new Error('Failed to fetch'),
      new HttpApiError('Bad Gateway', 502),
      '2026-10-04T10:05:00Z',
    ]);
    const sync = handleManualSyncGoogleHealth();

    await jest.advanceTimersByTimeAsync(GOOGLE_HEALTH_SYNC_POLL_MS * 3);
    await expect(sync).resolves.toBeUndefined();
  });

  it('stops waiting when the session is gone', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLastSyncAt([
      '2026-10-04T10:00:00Z',
      new HttpApiError('Authentication: Invalid or expired token.', 401),
    ]);
    const sync = handleManualSyncGoogleHealth();
    const assertion = expect(sync).rejects.toThrow('expired token');

    await jest.advanceTimersByTimeAsync(GOOGLE_HEALTH_SYNC_POLL_MS);
    await assertion;
    expect(
      jest.mocked(apiCall).mock.calls.filter(([e]) => e === STATUS)
    ).toHaveLength(2);
  });

  it('rejects when last_sync_at never changes', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLastSyncAt(['2026-10-04T10:00:00Z']);
    const sync = handleManualSyncGoogleHealth();
    const assertion = expect(sync).rejects.toThrow('It may still be running');

    await jest.advanceTimersByTimeAsync(
      GOOGLE_HEALTH_SYNC_TIMEOUT_MS + GOOGLE_HEALTH_SYNC_POLL_MS
    );
    await assertion;
  });
});
