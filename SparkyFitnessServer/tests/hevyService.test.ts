import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import hevyService from '../integrations/hevy/hevyService.js';
import hevyDataProcessor from '../integrations/hevy/hevyDataProcessor.js';
import { getSystemClient } from '../db/poolManager.js';
import { loadRawBundle } from '../utils/diagnosticLogger.js';

vi.mock('axios');
vi.mock('../db/poolManager.js');
vi.mock('../security/encryption.js', () => ({
  decrypt: vi.fn().mockResolvedValue('hevy_mock_api_key'),
  ENCRYPTION_KEY: 'mock_key',
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../utils/diagnosticLogger.js', () => ({
  logRawResponse: vi.fn(),
  loadRawBundle: vi.fn(),
}));
vi.mock('../integrations/hevy/hevyDataProcessor.js', () => ({
  default: {
    processHevyUserInfo: vi.fn().mockResolvedValue(undefined),
    processHevyWorkouts: vi.fn().mockResolvedValue({ processed: 1, failed: 0 }),
  },
}));

const workoutPage = (id: string, pageCount: number) => ({
  data: {
    page_count: pageCount,
    workouts: [{ id, start_time: new Date().toISOString() }],
  },
});

const mockHevyApi = (
  userInfo: () => Promise<unknown>,
  pages: Array<() => Promise<unknown>>
) => {
  vi.mocked(axios.get).mockImplementation(async (url, config) => {
    if (String(url).endsWith('/v1/user/info')) return userInfo();
    const page = (config?.params as { page: number }).page;
    return pages[page - 1]();
  });
};

describe('hevyService.syncHevyData', () => {
  let mockClient: { query: ReturnType<typeof vi.fn>; release: () => void };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            encrypted_app_key: 'enc_key',
            app_key_iv: 'iv',
            app_key_tag: 'tag',
          },
        ],
      }),
      release: vi.fn(),
    };
    vi.mocked(getSystemClient).mockResolvedValue(mockClient as never);
  });

  const lastSyncUpdates = () =>
    mockClient.query.mock.calls.filter(([sql]) =>
      String(sql).includes('last_sync_at')
    );

  it('updates last_sync_at when every workout page was fetched', async () => {
    mockHevyApi(
      async () => ({ data: { data: { id: 'hevy-user' } } }),
      [async () => workoutPage('w-1', 2), async () => workoutPage('w-2', 2)]
    );
    vi.mocked(hevyDataProcessor.processHevyWorkouts).mockResolvedValueOnce({
      processed: 2,
      failed: 0,
    });

    const result = await hevyService.syncHevyData(
      'user-1',
      'user-1',
      true,
      'provider-123'
    );

    expect(result).toEqual({
      success: true,
      processedCount: 2,
      source: 'live_api',
    });
    expect(lastSyncUpdates()).toEqual([
      [
        expect.stringContaining('UPDATE external_data_providers'),
        ['provider-123'],
      ],
    ]);
  });

  it('processes fetched workouts but leaves last_sync_at alone when a workout page fails', async () => {
    mockHevyApi(
      async () => ({ data: { data: { id: 'hevy-user' } } }),
      [
        async () => workoutPage('w-1', 2),
        async () => {
          throw new Error('Hevy unavailable');
        },
      ]
    );

    const result = await hevyService.syncHevyData(
      'user-1',
      'user-1',
      true,
      'provider-123'
    );

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(1);
    expect(hevyDataProcessor.processHevyWorkouts).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      [expect.objectContaining({ id: 'w-1' })],
      'UTC'
    );
    expect(lastSyncUpdates()).toHaveLength(0);
  });

  it('still updates last_sync_at when only the user info fetch fails', async () => {
    mockHevyApi(async () => {
      throw new Error('user info unavailable');
    }, [async () => workoutPage('w-1', 1)]);

    await hevyService.syncHevyData('user-1', 'user-1', true, 'provider-123');

    expect(hevyDataProcessor.processHevyUserInfo).not.toHaveBeenCalled();
    expect(lastSyncUpdates()).toHaveLength(1);
  });

  it('leaves last_sync_at alone when a workout fails to process', async () => {
    mockHevyApi(
      async () => ({ data: { data: { id: 'hevy-user' } } }),
      [async () => workoutPage('w-1', 1)]
    );
    vi.mocked(hevyDataProcessor.processHevyWorkouts).mockResolvedValueOnce({
      processed: 0,
      failed: 1,
    });

    const result = await hevyService.syncHevyData(
      'user-1',
      'user-1',
      true,
      'provider-123'
    );

    expect(result).toEqual({
      success: true,
      processedCount: 0,
      source: 'live_api',
    });
    expect(lastSyncUpdates()).toHaveLength(0);
  });

  it('applies the same rule when replaying a raw bundle', async () => {
    vi.mocked(loadRawBundle).mockReturnValue({
      last_updated: '2026-11-01',
      responses: {
        raw_workouts_page_1: { data: { workouts: [{ id: 'w-1' }] } },
      },
    });

    vi.mocked(hevyDataProcessor.processHevyWorkouts).mockResolvedValueOnce({
      processed: 0,
      failed: 1,
    });
    await hevyService.syncHevyData(
      'user-1',
      'user-1',
      false,
      'provider-123',
      null,
      null,
      'local'
    );
    expect(lastSyncUpdates()).toHaveLength(0);

    await hevyService.syncHevyData(
      'user-1',
      'user-1',
      false,
      'provider-123',
      null,
      null,
      'local'
    );
    expect(lastSyncUpdates()).toHaveLength(1);
  });

  describe('replaying a raw bundle', () => {
    const replay = (providerId?: string) =>
      hevyService.syncHevyData(
        'user-1',
        'user-1',
        false,
        providerId,
        null,
        null,
        'local'
      );

    beforeEach(() => {
      vi.mocked(loadRawBundle).mockReturnValue({
        last_updated: '2026-11-01',
        responses: {
          raw_workouts_page_1: { data: { workouts: [{ id: 'w-1' }] } },
        },
      });
    });

    it('updates only the chosen provider', async () => {
      await replay('provider-123');

      const [[sql, params]] = lastSyncUpdates();
      expect(sql).toContain('WHERE id = $1 AND user_id = $2');
      expect(sql).not.toContain('provider_type');
      expect(params).toEqual(['provider-123', 'user-1']);
    });

    it('falls back to the provider the lookup picks', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'provider-456' }],
      });

      await replay();

      expect(lastSyncUpdates()).toEqual([
        [expect.any(String), ['provider-456', 'user-1']],
      ]);
    });

    it('reports processed workouts, not fetched ones', async () => {
      vi.mocked(hevyDataProcessor.processHevyWorkouts).mockResolvedValueOnce({
        processed: 0,
        failed: 1,
      });

      const result = await replay('provider-123');

      expect(result.processedCount).toBe(0);
    });
  });
});
