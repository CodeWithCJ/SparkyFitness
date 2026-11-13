import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import googleHealthIntegrationService from '../integrations/googlehealth/googleHealthService.js';
import { log } from '../config/logging.js';

vi.mock('axios');
vi.mock('../db/poolManager.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/diagnosticLogger.js', () => ({ logRawResponse: vi.fn() }));

const httpError = (status: number) =>
  Object.assign(new Error(`status ${status}`), { response: { status } });

describe('Google Health daily rollups', () => {
  beforeEach(() => vi.clearAllMocks());

  const fetchTwoDays = () =>
    googleHealthIntegrationService.fetchSteps(
      'user-1',
      '2026-10-31',
      '2026-11-01',
      'token'
    );

  it('keeps the days it got and names the day that failed', async () => {
    const point = { steps: { countSum: 10 } };
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: { rollupDataPoints: [point] } })
      .mockRejectedValueOnce(httpError(503));

    await expect(fetchTwoDays()).resolves.toEqual({
      rollupDataPoints: [point],
      failedDays: ['2026-11-01'],
    });
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('steps rollup for 2026-11-01')
    );
  });

  it('does not treat a missing permission as a failed day', async () => {
    vi.mocked(axios.post).mockRejectedValue(httpError(403));

    await expect(fetchTwoDays()).resolves.toEqual({
      rollupDataPoints: [],
      failedDays: [],
    });
    expect(log).not.toHaveBeenCalledWith('warn', expect.anything());
  });
});
