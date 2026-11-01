import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stravaService from '../services/stravaService.js';
import googleHealthService from '../services/googleHealthService.js';
import stravaIntegrationService from '../integrations/strava/stravaService.js';
import stravaDataProcessor from '../integrations/strava/stravaDataProcessor.js';
import googleHealthIntegrationService from '../integrations/googlehealth/googleHealthService.js';
import { getSystemClient } from '../db/poolManager.js';
import { loadRawBundle } from '../utils/diagnosticLogger.js';

vi.mock('../db/poolManager.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../utils/diagnosticLogger.js', () => ({
  loadRawBundle: vi.fn(),
  logRawResponse: vi.fn(),
}));
vi.mock('../integrations/strava/stravaService.js');
vi.mock('../integrations/strava/stravaDataProcessor.js');
vi.mock('../integrations/googlehealth/googleHealthService.js');
vi.mock('../integrations/googlehealth/googleHealthDataProcessor.js');

const httpError = (status: number) =>
  Object.assign(new Error(`status ${status}`), { response: { status } });

describe('required provider fetches', () => {
  let query: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    query = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getSystemClient).mockResolvedValue({
      query,
      release: vi.fn(),
    } as never);
  });

  afterEach(() => vi.useRealTimers());

  // The services pause between API calls, so timers have to be advanced.
  const finish = async <T>(run: Promise<T>): Promise<T> => {
    await vi.runAllTimersAsync();
    return run;
  };

  describe('Strava', () => {
    const sync = () =>
      finish(stravaService.syncStravaData('user-1', 'scheduled'));

    beforeEach(() => {
      vi.mocked(stravaIntegrationService.getValidAccessToken).mockResolvedValue(
        'token' as never
      );
      vi.mocked(stravaIntegrationService.fetchAthlete).mockResolvedValue(
        null as never
      );
      vi.mocked(
        stravaIntegrationService.fetchAllActivitiesInRange
      ).mockResolvedValue([] as never);
    });

    it('reports a failed activity list and leaves last_sync_at alone', async () => {
      vi.mocked(
        stravaIntegrationService.fetchAllActivitiesInRange
      ).mockRejectedValueOnce(httpError(503));

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual(['raw_activities_list']);
      expect(result.success).toBe(true);
      expect(query).not.toHaveBeenCalled();
    });

    it('does not report an optional fetch', async () => {
      vi.mocked(stravaIntegrationService.fetchAthlete).mockRejectedValueOnce(
        httpError(503)
      );

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([]);
      expect(query).toHaveBeenCalledOnce();
    });

    it('does not report a scope the person did not grant', async () => {
      vi.mocked(
        stravaIntegrationService.fetchAllActivitiesInRange
      ).mockRejectedValueOnce(httpError(401));

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([]);
      expect(query).toHaveBeenCalledOnce();
    });

    it('counts only saved activities and leaves last_sync_at alone when one fails', async () => {
      vi.mocked(
        stravaIntegrationService.fetchAllActivitiesInRange
      ).mockResolvedValueOnce([{ id: 1 }, { id: 2 }] as never);
      vi.mocked(
        stravaDataProcessor.processStravaActivities
      ).mockResolvedValueOnce({ processed: 1, failed: 1 });

      const result = await sync();

      expect(result).toMatchObject({
        success: true,
        activitiesProcessed: 1,
        activitiesFailed: 1,
        failedRequiredFetches: [],
      });
      expect(query).not.toHaveBeenCalled();
    });

    it('updates last_sync_at when every activity entry was saved', async () => {
      vi.mocked(
        stravaIntegrationService.fetchAllActivitiesInRange
      ).mockResolvedValueOnce([{ id: 1 }, { id: 2 }] as never);
      vi.mocked(
        stravaDataProcessor.processStravaActivities
      ).mockResolvedValueOnce({ processed: 2, failed: 0 });

      const result = await sync();

      expect(result).toMatchObject({
        activitiesProcessed: 2,
        activitiesFailed: 0,
      });
      expect(query).toHaveBeenCalledOnce();
    });

    it('replays a raw bundle without touching last_sync_at', async () => {
      vi.mocked(loadRawBundle).mockReturnValueOnce({
        last_updated: '2026-11-01',
        responses: {},
      });

      const result = await finish(
        stravaService.syncStravaData('user-1', 'manual', null, null, 'local')
      );

      expect(result).toMatchObject({
        source: 'local_raw_replay',
        failedRequiredFetches: [],
      });
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('Google Health', () => {
    const sync = () =>
      finish(googleHealthService.syncGoogleHealthData('user-1', 'scheduled'));

    beforeEach(() => {
      vi.mocked(
        googleHealthIntegrationService.getValidAccessToken
      ).mockResolvedValue('token' as never);
    });

    it.each([
      ['steps', () => googleHealthIntegrationService.fetchSteps],
      ['sleep', () => googleHealthIntegrationService.fetchSleep],
      ['activities', () => googleHealthIntegrationService.fetchActivities],
    ])('reports failed %s and leaves last_sync_at alone', async (name, fn) => {
      vi.mocked(fn()).mockRejectedValueOnce(httpError(503));

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([name]);
      expect(query).not.toHaveBeenCalled();
    });

    it('reports steps when a day failed even though the fetch returned', async () => {
      vi.mocked(
        googleHealthIntegrationService.fetchSteps
      ).mockResolvedValueOnce({
        rollupDataPoints: [],
        failedDays: ['2026-11-01'],
      });

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual(['steps']);
      expect(query).not.toHaveBeenCalled();
    });

    it('replays a raw bundle without touching last_sync_at', async () => {
      vi.mocked(loadRawBundle).mockReturnValueOnce({
        last_updated: '2026-11-01',
        responses: {},
      });

      const result = await finish(
        googleHealthService.syncGoogleHealthData(
          'user-1',
          'manual',
          null,
          null,
          'local'
        )
      );

      expect(result.source).toBe('local_raw_replay');
      expect(query).not.toHaveBeenCalled();
    });

    it('does not report an optional fetch', async () => {
      vi.mocked(googleHealthIntegrationService.fetchHRV).mockRejectedValueOnce(
        httpError(503)
      );

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([]);
      expect(query).toHaveBeenCalledOnce();
    });

    it('does not report a scope the person did not grant', async () => {
      vi.mocked(
        googleHealthIntegrationService.fetchSleep
      ).mockRejectedValueOnce(httpError(403));

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([]);
      expect(query).toHaveBeenCalledOnce();
    });
  });
});
