import { vi, beforeEach, describe, it, expect } from 'vitest';
import { todayInZone, addDays, dayRangeToUtcRange } from '@workspace/shared';

const { queryMock, releaseMock } = vi.hoisted(() => ({
  queryMock: vi.fn().mockResolvedValue({ rows: [] }),
  releaseMock: vi.fn(),
}));

vi.mock('../integrations/oura/ouraService.js', () => ({
  default: {
    getValidAccessToken: vi.fn().mockResolvedValue('token-1'),
    fetchSleepPeriods: vi.fn().mockResolvedValue({ data: [] }),
    fetchDailySleep: vi.fn().mockResolvedValue({ data: [] }),
    fetchDailyActivity: vi.fn().mockResolvedValue({ data: [] }),
    fetchDailyReadiness: vi.fn().mockResolvedValue({ data: [] }),
    fetchDailySpo2: vi.fn().mockResolvedValue({ data: [] }),
    fetchDailyStress: vi.fn().mockResolvedValue({ data: [] }),
    fetchDailyCardiovascularAge: vi.fn().mockResolvedValue({ data: [] }),
    fetchVo2Max: vi.fn().mockResolvedValue({ data: [] }),
    fetchHeartRate: vi.fn().mockResolvedValue({ data: [] }),
    fetchWorkouts: vi.fn().mockResolvedValue({ data: [] }),
    getStatus: vi.fn(),
    disconnectOura: vi.fn(),
  },
}));
vi.mock('../integrations/oura/ouraDataProcessor.js', () => ({
  default: {
    processOuraSleep: vi.fn().mockResolvedValue(undefined),
    processOuraDailyActivity: vi.fn().mockResolvedValue(undefined),
    processOuraDailyReadiness: vi.fn().mockResolvedValue(undefined),
    processOuraDailySpo2: vi.fn().mockResolvedValue(undefined),
    processOuraDailyStress: vi.fn().mockResolvedValue(undefined),
    processOuraCardioAge: vi.fn().mockResolvedValue(undefined),
    processOuraVo2Max: vi.fn().mockResolvedValue(undefined),
    processOuraHeartRate: vi.fn().mockResolvedValue(undefined),
    processOuraWorkouts: vi.fn().mockResolvedValue({ processed: 0, failed: 0 }),
  },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn().mockImplementation(async () => ({
    query: queryMock,
    release: releaseMock,
  })),
}));
vi.mock('../utils/diagnosticLogger.js', () => ({
  loadRawBundle: vi.fn(),
  logRawResponse: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { syncOuraData } from '../services/ouraService.js';
import ouraIntegrationService from '../integrations/oura/ouraService.js';
import ouraDataProcessor from '../integrations/oura/ouraDataProcessor.js';
import { log } from '../config/logging.js';
import { loadRawBundle } from '../utils/diagnosticLogger.js';

const UID = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockResolvedValue({ rows: [] });
  vi.mocked(ouraIntegrationService.getValidAccessToken).mockResolvedValue(
    'token-1'
  );
});

describe('syncOuraData sync windows', () => {
  it('manual sync uses a 7-day lookback window', async () => {
    const today = todayInZone('UTC');
    await syncOuraData(UID, 'manual');
    expect(ouraIntegrationService.fetchDailyActivity).toHaveBeenCalledWith(
      UID,
      addDays(today, -7),
      today,
      'token-1'
    );
    expect(ouraIntegrationService.fetchSleepPeriods).toHaveBeenCalledWith(
      UID,
      addDays(today, -7),
      addDays(today, 1),
      'token-1'
    );
    expect(ouraIntegrationService.fetchWorkouts).toHaveBeenCalledWith(
      UID,
      addDays(today, -7),
      addDays(today, 1),
      'token-1'
    );
  });

  it('scheduled sync uses a yesterday-to-today window', async () => {
    const today = todayInZone('UTC');
    await syncOuraData(UID, 'scheduled');
    expect(ouraIntegrationService.fetchDailyActivity).toHaveBeenCalledWith(
      UID,
      addDays(today, -1),
      today,
      'token-1'
    );
  });

  it('custom date range is passed through and heart rate uses UTC datetimes', async () => {
    await syncOuraData(UID, 'manual', '2026-07-01', '2026-07-03');
    expect(ouraIntegrationService.fetchDailyActivity).toHaveBeenCalledWith(
      UID,
      '2026-07-01',
      '2026-07-03',
      'token-1'
    );
    const { start } = dayRangeToUtcRange('2026-07-01', '2026-07-03', 'UTC');
    const [, hrStart, hrEnd] = vi.mocked(ouraIntegrationService.fetchHeartRate)
      .mock.calls[0];
    expect(hrStart).toBe(start.toISOString());
    expect(new Date(hrEnd as string).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('rejects an unknown syncType', async () => {
    await expect(syncOuraData(UID, 'nonsense')).rejects.toThrow(
      /Invalid syncType/
    );
  });
});

describe('syncOuraData resilience and bookkeeping', () => {
  it('continues processing other datasets when one fetch fails', async () => {
    vi.mocked(ouraIntegrationService.fetchDailyActivity).mockRejectedValueOnce(
      new Error('429')
    );
    const result = await syncOuraData(UID, 'scheduled');
    expect(result).toEqual({
      success: true,
      source: 'live_api',
      workoutsFailed: 0,
      failedRequiredFetches: ['daily activity'],
    });
    expect(ouraDataProcessor.processOuraDailyActivity).not.toHaveBeenCalled();
    expect(ouraDataProcessor.processOuraWorkouts).toHaveBeenCalled();
    expect(ouraDataProcessor.processOuraSleep).toHaveBeenCalled();
  });

  it('leaves last_sync_at alone when a workout fails to save', async () => {
    vi.mocked(ouraDataProcessor.processOuraWorkouts).mockResolvedValueOnce({
      processed: 1,
      failed: 1,
    });
    const result = await syncOuraData(UID, 'scheduled');
    expect(result.workoutsFailed).toBe(1);
    expect(result.failedRequiredFetches).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('failed workouts: 1')
    );
  });

  it('updates last_sync_at when every workout entry was saved', async () => {
    vi.mocked(ouraDataProcessor.processOuraWorkouts).mockResolvedValueOnce({
      processed: 1,
      failed: 0,
    });
    const result = await syncOuraData(UID, 'scheduled');
    expect(result.workoutsFailed).toBe(0);
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it('replays a raw bundle without touching last_sync_at', async () => {
    vi.mocked(loadRawBundle).mockReturnValueOnce({
      last_updated: '2026-11-01',
      responses: {},
    });
    const result = await syncOuraData(UID, 'manual', null, null, 'local');
    expect(result.source).toBe('local_raw_replay');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('leaves last_sync_at alone when a required fetch fails', async () => {
    vi.mocked(ouraIntegrationService.fetchWorkouts).mockRejectedValueOnce(
      Object.assign(new Error('unavailable'), { response: { status: 503 } })
    );
    const result = await syncOuraData(UID, 'scheduled');
    expect(result.failedRequiredFetches).toEqual(['workouts']);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does not count an optional fetch as failed', async () => {
    vi.mocked(ouraIntegrationService.fetchVo2Max).mockRejectedValueOnce(
      new Error('unavailable')
    );
    const result = await syncOuraData(UID, 'scheduled');
    expect(result.failedRequiredFetches).toEqual([]);
    expect(queryMock).toHaveBeenCalled();
  });

  it('does not count a scope the person did not grant', async () => {
    vi.mocked(ouraIntegrationService.fetchWorkouts).mockRejectedValueOnce(
      Object.assign(new Error('forbidden'), { response: { status: 403 } })
    );
    const result = await syncOuraData(UID, 'scheduled');
    expect(result.failedRequiredFetches).toEqual([]);
    expect(queryMock).toHaveBeenCalled();
  });

  it('updates last_sync_at after a successful sync', async () => {
    await syncOuraData(UID, 'scheduled');
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('last_sync_at'),
      [UID]
    );
    expect(releaseMock).toHaveBeenCalled();
  });

  it('fails when no access token is available', async () => {
    vi.mocked(ouraIntegrationService.getValidAccessToken).mockResolvedValue(
      null
    );
    await expect(syncOuraData(UID, 'scheduled')).rejects.toThrow(
      /No Oura access token/
    );
  });
});
