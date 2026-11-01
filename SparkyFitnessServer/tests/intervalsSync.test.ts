import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import intervalsService, {
  intervalsErrorStatus,
} from '../integrations/intervals/intervalsService.js';
import intervalsDataProcessor from '../integrations/intervals/intervalsDataProcessor.js';
import { getSystemClient } from '../db/poolManager.js';

vi.mock('axios');
vi.mock('../db/poolManager.js');
vi.mock('../security/encryption.js', () => ({
  decrypt: vi.fn(async (value: string) =>
    value === 'enc_id' ? 'i12345' : 'secret-key'
  ),
  ENCRYPTION_KEY: 'mock_key',
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../integrations/intervals/intervalsDataProcessor.js', () => ({
  default: {
    processIntervalsActivities: vi
      .fn()
      .mockResolvedValue({ imported: 2, skipped: 1, failed: 0, removed: 1 }),
    processIntervalsWellness: vi.fn().mockResolvedValue(3),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/diagnosticLogger.js', () => ({
  logRawResponse: vi.fn(),
  loadRawBundle: vi.fn(),
}));
import { loadRawBundle, logRawResponse } from '../utils/diagnosticLogger.js';

const providerRow = {
  id: 'provider-1',
  is_active: true,
  last_sync_at: null,
  encrypted_app_id: 'enc_id',
  app_id_iv: 'iv',
  app_id_tag: 'tag',
  encrypted_app_key: 'enc_key',
  app_key_iv: 'iv',
  app_key_tag: 'tag',
};

describe('intervalsService.syncIntervalsData', () => {
  let query: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    query = vi.fn(async (sql: string) =>
      sql.includes("provider_type = 'garmin'")
        ? { rows: [], rowCount: 0 }
        : { rows: [providerRow], rowCount: 1 }
    );
    vi.mocked(getSystemClient).mockResolvedValue({
      query,
      release: vi.fn(),
    } as never);
    vi.mocked(axios.get).mockResolvedValue({ data: [] });
  });

  afterEach(() => vi.useRealTimers());

  it('pulls activities and wellness for the range with Basic auth', async () => {
    const result = await intervalsService.syncIntervalsData(
      'user-1',
      'user-1',
      'provider-1',
      '2026-10-01',
      '2026-10-05'
    );

    expect(result).toEqual({
      success: true,
      activitiesImported: 2,
      activitiesSkipped: 1,
      activitiesFailed: 0,
      activitiesRemoved: 1,
      wellnessDays: 3,
    });
    const auth = { username: 'API_KEY', password: 'secret-key' };
    expect(axios.get).toHaveBeenCalledWith(
      'https://intervals.icu/api/v1/athlete/i12345/activities',
      { auth, params: { oldest: '2026-10-01', newest: '2026-10-05T23:59:59' } }
    );
    expect(axios.get).toHaveBeenCalledWith(
      'https://intervals.icu/api/v1/athlete/i12345/wellness',
      {
        auth,
        params: {
          oldest: '2026-10-01',
          newest: '2026-10-05',
          fields:
            'id,weight,bodyFat,steps,restingHR,vo2max,hrv,hrvSDNN,floorsClimbed,ctl,atl,spO2,respiration',
        },
      }
    );
    expect(
      intervalsDataProcessor.processIntervalsActivities
    ).toHaveBeenCalledWith('user-1', 'user-1', [], false);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET last_sync_at = NOW()'),
      ['provider-1']
    );
  });

  it('leaves last_sync_at alone when an activity fails, but still reports the result', async () => {
    vi.mocked(
      intervalsDataProcessor.processIntervalsActivities
    ).mockResolvedValueOnce({ imported: 1, skipped: 0, failed: 1, removed: 0 });

    const result = await intervalsService.syncIntervalsData(
      'user-1',
      'user-1',
      'provider-1'
    );

    expect(result).toMatchObject({
      success: true,
      activitiesImported: 1,
      activitiesFailed: 1,
    });
    expect(intervalsDataProcessor.processIntervalsWellness).toHaveBeenCalled();
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET last_sync_at = NOW()'),
      expect.anything()
    );
  });

  it('defaults to yesterday and today in the user timezone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));

    await intervalsService.syncIntervalsData('user-1', 'user-1');

    expect(vi.mocked(axios.get).mock.calls[0]![1]).toMatchObject({
      params: { oldest: '2026-10-13', newest: '2026-10-14T23:59:59' },
    });
  });

  it('tells the processor when Garmin is connected', async () => {
    query.mockImplementation(async () => ({
      rows: [providerRow],
      rowCount: 1,
    }));

    await intervalsService.syncIntervalsData('user-1', 'user-1', 'provider-1');

    expect(
      intervalsDataProcessor.processIntervalsActivities
    ).toHaveBeenCalledWith('user-1', 'user-1', [], true);
  });

  it('waits out a 429 once using Retry-After', async () => {
    vi.useFakeTimers();
    vi.mocked(axios.get)
      .mockRejectedValueOnce({
        response: { status: 429, headers: { 'retry-after': '2' } },
      })
      .mockResolvedValue({ data: [] });

    const sync = intervalsService.syncIntervalsData('user-1', 'user-1');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(sync).resolves.toMatchObject({ success: true });
    expect(axios.get).toHaveBeenCalledTimes(3);
  });

  it('fails on a second 429 and on auth errors', async () => {
    vi.useFakeTimers();
    const rateLimited = { response: { status: 429, headers: {} } };
    vi.mocked(axios.get).mockRejectedValue(rateLimited);

    const sync = intervalsService.syncIntervalsData('user-1', 'user-1');
    const assertion = expect(sync).rejects.toBe(rateLimited);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    const unauthorized = { response: { status: 401 } };
    vi.mocked(axios.get).mockRejectedValue(unauthorized);
    await expect(
      intervalsService.syncIntervalsData('user-1', 'user-1')
    ).rejects.toBe(unauthorized);
    expect(intervalsErrorStatus(unauthorized)).toBe(401);
  });

  it('offers each raw response to the capture logger', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: [{ id: 'i1' }] })
      .mockResolvedValueOnce({ data: [{ id: '2026-10-01' }] });

    await intervalsService.syncIntervalsData('user-1', 'user-1', 'provider-1');

    expect(logRawResponse).toHaveBeenCalledWith('intervals', 'raw_activities', [
      { id: 'i1' },
    ]);
    expect(logRawResponse).toHaveBeenCalledWith('intervals', 'raw_wellness', [
      { id: '2026-10-01' },
    ]);
  });

  it('replays a captured bundle without calling Intervals', async () => {
    vi.mocked(loadRawBundle).mockReturnValue({
      responses: {
        raw_activities: { data: [{ id: 'i9' }] },
        raw_wellness: { data: [{ id: '2026-10-02', weight: 70 }] },
      },
    });

    await intervalsService.syncIntervalsData(
      'user-1',
      'user-1',
      'provider-1',
      null,
      null,
      { dataSource: 'local' }
    );

    expect(axios.get).not.toHaveBeenCalled();
    expect(
      intervalsDataProcessor.processIntervalsActivities
    ).toHaveBeenCalledWith('user-1', 'user-1', [{ id: 'i9' }], false);
    expect(
      intervalsDataProcessor.processIntervalsWellness
    ).toHaveBeenCalledWith('user-1', 'user-1', [
      { id: '2026-10-02', weight: 70 },
    ]);
  });

  it('refuses to replay when no bundle was captured', async () => {
    vi.mocked(loadRawBundle).mockReturnValue(null);

    await expect(
      intervalsService.syncIntervalsData(
        'user-1',
        'user-1',
        undefined,
        null,
        null,
        {
          dataSource: 'local',
        }
      )
    ).rejects.toThrow('Raw diagnostic bundle not found');
  });

  it('refuses to sync without stored credentials', async () => {
    query.mockResolvedValue({
      rows: [{ ...providerRow, encrypted_app_id: null }],
    });

    await expect(
      intervalsService.syncIntervalsData('user-1', 'user-1')
    ).rejects.toThrow('athlete ID or API key is missing');
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe('intervalsService status and disconnect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports not connected and refuses to disconnect without a provider', async () => {
    vi.mocked(getSystemClient).mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    } as never);

    await expect(intervalsService.getStatus('user-1')).resolves.toEqual({
      connected: false,
      lastSyncAt: null,
    });
    await expect(intervalsService.disconnect('user-1')).resolves.toBe(false);
  });

  it('deactivates the provider row on disconnect', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [providerRow] })
      .mockResolvedValueOnce({ rowCount: 1 });
    vi.mocked(getSystemClient).mockResolvedValue({
      query,
      release: vi.fn(),
    } as never);

    await expect(intervalsService.disconnect('user-1')).resolves.toBe(true);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('SET is_active = FALSE'),
      ['provider-1', 'user-1']
    );
  });
});
