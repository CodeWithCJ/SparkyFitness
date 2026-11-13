import { postHealthMetricSamples } from '../../../src/services/api/healthSamplesApi';
import { apiFetch } from '../../../src/services/api/apiClient';
import type { HealthMetricSamplesWriteBody } from '@workspace/shared';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn().mockResolvedValue({}),
}));

describe('postHealthMetricSamples', () => {
  it('keeps the response body out of the app log and forwards the signal', async () => {
    const body: HealthMetricSamplesWriteBody = {
      metric: 'heart_rate',
      source: 'SparkyFitness Mobile',
      mode: 'merge',
      window: {
        start: '2026-11-01T00:00:00.000Z',
        end: '2026-11-02T00:00:00.000Z',
      },
      samples: [{ t: '2026-11-01T08:00:00.000Z', bpm: 66 }],
    };
    const signal = new AbortController().signal;
    const serverConfig = {
      id: 'server-1',
      url: 'https://sparky.example',
      apiKey: 'key-1',
    };
    await postHealthMetricSamples(body, signal, serverConfig);
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/generic-health/samples',
        method: 'POST',
        body,
        signal,
        serverConfig,
        logResponseBody: false,
      })
    );
  });
});
