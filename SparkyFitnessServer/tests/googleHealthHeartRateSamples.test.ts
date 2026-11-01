import { vi, beforeEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import { fetchHeartRateSamples } from '../integrations/googlehealth/googleHealthService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/diagnosticLogger.js', () => ({ logRawResponse: vi.fn() }));
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../db/poolManager.js', () => ({ getSystemClient: vi.fn() }));
vi.mock('../security/encryption.js', () => ({
  ENCRYPTION_KEY: 'test-key',
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchHeartRateSamples', () => {
  it('asks for readings between two instants and follows every page', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({
        data: { dataPoints: [{ id: 1 }], nextPageToken: 'page-2' },
      })
      .mockResolvedValueOnce({ data: { dataPoints: [{ id: 2 }] } });

    const result = await fetchHeartRateSamples(
      'user-1',
      '2026-11-02T17:00:00.000Z',
      '2026-11-02T17:40:00.000Z',
      'token'
    );

    expect(result.dataPoints).toEqual([{ id: 1 }, { id: 2 }]);
    expect(axios.get).toHaveBeenCalledTimes(2);
    const [url, config] = vi.mocked(axios.get).mock.calls[0];
    expect(url).toMatch(/\/heart-rate\/dataPoints$/);
    expect(config?.params).toEqual({
      pageSize: 1000,
      filter:
        'heart_rate.sample_time.physical_time >= "2026-11-02T17:00:00.000Z" AND heart_rate.sample_time.physical_time < "2026-11-02T17:40:00.000Z"',
    });
    expect(config?.headers).toEqual({ Authorization: 'Bearer token' });
    expect(vi.mocked(axios.get).mock.calls[1][1]?.params).toMatchObject({
      pageToken: 'page-2',
    });
  });

  it('does not retry without the filter when the request fails', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(
      Object.assign(new Error('bad request'), { response: { status: 400 } })
    );

    await expect(
      fetchHeartRateSamples(
        'user-1',
        '2026-11-02T17:00:00.000Z',
        '2026-11-02T17:40:00.000Z',
        'token'
      )
    ).rejects.toThrow('bad request');
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
