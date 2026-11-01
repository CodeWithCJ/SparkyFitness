import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stravaService from '../services/stravaService.js';
import fitbitService from '../services/fitbitService.js';
import stravaIntegrationService from '../integrations/strava/stravaService.js';
import stravaDataProcessor from '../integrations/strava/stravaDataProcessor.js';
import fitbitIntegrationService from '../integrations/fitbit/fitbitService.js';
import fitbitDataProcessor from '../integrations/fitbit/fitbitDataProcessor.js';
import { getSystemClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../integrations/strava/stravaService.js');
vi.mock('../integrations/strava/stravaDataProcessor.js');
vi.mock('../integrations/fitbit/fitbitService.js');
vi.mock('../integrations/fitbit/fitbitDataProcessor.js');

const YESTERDAY = '2026-10-31';
const TODAY = '2026-11-01';

describe('scheduled sync window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
    vi.mocked(getSystemClient).mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    } as never);
  });

  afterEach(() => vi.useRealTimers());

  // Both services pause between API calls, so timers have to be advanced.
  const finish = async <T>(run: Promise<T>): Promise<T> => {
    await vi.runAllTimersAsync();
    return run;
  };

  it('starts at yesterday for Strava', async () => {
    vi.mocked(stravaIntegrationService.getValidAccessToken).mockResolvedValue(
      'token' as never
    );
    vi.mocked(
      stravaIntegrationService.fetchAllActivitiesInRange
    ).mockResolvedValue([{ id: 1 }] as never);

    await finish(stravaService.syncStravaData('user-1', 'scheduled'));

    const [, afterEpoch, beforeEpoch] = vi.mocked(
      stravaIntegrationService.fetchAllActivitiesInRange
    ).mock.calls[0]!;
    expect(afterEpoch).toBe(Date.parse(`${YESTERDAY}T00:00:00Z`) / 1000);
    expect(beforeEpoch).toBeGreaterThan(
      Date.parse(`${TODAY}T00:00:00Z`) / 1000
    );
    // The processor drops anything before this day, so it has to move as well.
    expect(stravaDataProcessor.processStravaActivities).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      [{ id: 1 }],
      expect.anything(),
      YESTERDAY,
      'UTC'
    );
  });

  it('starts at yesterday for Fitbit', async () => {
    vi.mocked(fitbitIntegrationService.getValidAccessToken).mockResolvedValue(
      'token' as never
    );
    vi.mocked(fitbitIntegrationService.fetchActivities).mockResolvedValue({
      activities: [],
    } as never);

    await finish(fitbitService.syncFitbitData('user-1', 'scheduled'));

    expect(fitbitIntegrationService.fetchSteps).toHaveBeenCalledWith(
      'user-1',
      YESTERDAY,
      TODAY,
      'token'
    );
    expect(fitbitIntegrationService.fetchActivities).toHaveBeenCalledWith(
      'user-1',
      YESTERDAY,
      'token'
    );
    // The processor drops anything before this day, so it has to move as well.
    expect(fitbitDataProcessor.processFitbitActivities).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      { activities: [] },
      YESTERDAY
    );
  });
});
