import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHuaweiHealthClient } from '../integrations/huaweihealth/huaweiHealthClient.js';

function createHttpClient() {
  return {
    post: vi.fn(
      async (
        _url: string,
        _body: unknown,
        _config: { headers: Record<string, string> }
      ): Promise<{ data: unknown; headers: Record<string, string> }> => ({
        data: {},
        headers: { 'x-health-app-privacy': '1' },
      })
    ),
    get: vi.fn(
      async (
        _url: string,
        _config: {
          headers: Record<string, string>;
          params: Record<string, unknown>;
        }
      ): Promise<{ data: unknown; headers: Record<string, string> }> => ({
        data: {},
        headers: { 'x-health-app-privacy': '1' },
      })
    ),
  };
}

describe('Huawei Health REST client', () => {
  beforeEach(() => {
    process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_ID = 'client-id';
    process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_SECRET = 'client-secret';
    process.env.SPARKY_FITNESS_FRONTEND_URL = 'https://fitness.example.com';
    process.env.npm_package_version = '0.17.3';
  });

  afterEach(() => {
    delete process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_ID;
    delete process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_SECRET;
    delete process.env.SPARKY_FITNESS_HUAWEI_HEALTH_APP_ID;
    delete process.env.SPARKY_FITNESS_FRONTEND_URL;
    delete process.env.npm_package_version;
    vi.restoreAllMocks();
  });

  it('posts a validated daily-polymerize request with Huawei trace headers', async () => {
    const httpClient = createHttpClient();
    httpClient.post.mockResolvedValue({
      data: { group: [] },
      headers: { 'x-health-app-privacy': '1' },
    });
    const client = createHuaweiHealthClient({
      httpClient,
      randomUUID: () => 'trace-id',
    });

    await expect(
      client.fetchDailySummary('access-token', {
        dataTypes: ['com.huawei.continuous.steps.total'],
        startDay: '20260701',
        endDay: '20260707',
        timeZone: '+0300',
      })
    ).resolves.toEqual({ group: [] });

    expect(httpClient.post).toHaveBeenCalledWith(
      'https://health-api.cloud.huawei.com/healthkit/v2/sampleSet:dailyPolymerize',
      {
        dataTypes: ['com.huawei.continuous.steps.total'],
        startDay: '20260701',
        endDay: '20260707',
        timeZone: '+0300',
      },
      {
        timeout: 15_000,
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json; charset=UTF-8',
          'x-caller-trace-id': 'trace-id',
          'x-client-id': 'client-id',
          'x-version': '0.17.3',
        },
      }
    );
  });

  it('queries sleep records with nanosecond boundaries', async () => {
    const httpClient = createHttpClient();
    httpClient.get.mockResolvedValue({
      data: { healthRecords: [] },
      headers: { 'x-health-app-privacy': '1' },
    });
    const client = createHuaweiHealthClient({
      httpClient,
      randomUUID: () => 'trace-id',
    });

    await client.fetchSleepRecords(
      'access-token',
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-08T00:00:00.000Z')
    );

    expect(httpClient.get.mock.calls[0][1].params).toEqual({
      startTime: '1782864000000000000',
      endTime: '1783468799999000000',
      dataType: 'com.huawei.health.record.sleep',
    });
  });

  it('follows activity cursors and combines validated pages', async () => {
    const httpClient = createHttpClient();
    httpClient.get
      .mockResolvedValueOnce({
        data: {
          activityRecord: [
            {
              id: 'activity-1',
              startTime: 1,
              endTime: 2,
              activityType: 56,
            },
          ],
          deletedActivityRecord: [],
          hasMoreData: true,
          cursor: 'next-page',
        },
        headers: { 'x-health-app-privacy': '1' },
      })
      .mockResolvedValueOnce({
        data: {
          activityRecord: [
            {
              id: 'activity-2',
              startTime: 3,
              endTime: 4,
              activityType: 90,
            },
          ],
          deletedActivityRecord: [],
          hasMoreData: false,
        },
        headers: { 'x-health-app-privacy': '1' },
      });
    const client = createHuaweiHealthClient({
      httpClient,
      randomUUID: () => 'trace-id',
    });

    const result = await client.fetchActivities(
      'access-token',
      Date.parse('2026-07-01T00:00:00.000Z'),
      Date.parse('2026-07-08T00:00:00.000Z') - 1
    );

    expect(result.activityRecord.map((record) => record.id)).toEqual([
      'activity-1',
      'activity-2',
    ]);
    expect(httpClient.get).toHaveBeenCalledTimes(2);
    expect(httpClient.get.mock.calls[0][1].params).toEqual({
      startTime: 1_782_864_000_000,
      endTime: 1_783_468_799_999,
    });
    expect(httpClient.get.mock.calls[1][1].params).toEqual({
      cursor: 'next-page',
    });
  });

  it('turns Huawei privacy-switch responses into a stable integration error', async () => {
    const httpClient = createHttpClient();
    httpClient.post.mockResolvedValue({
      data: { group: [] },
      headers: { 'x-health-app-privacy': '2' },
    });
    const client = createHuaweiHealthClient({
      httpClient,
      randomUUID: () => 'trace-id',
    });

    await expect(
      client.fetchDailySummary('access-token', {
        dataTypes: ['com.huawei.continuous.steps.total'],
        startDay: '20260701',
        endDay: '20260707',
        timeZone: '+0300',
      })
    ).rejects.toMatchObject({
      code: 'HUAWEI_PRIVACY_DISABLED',
      statusCode: 403,
    });
  });

  it('fails closed when a successful health response omits the mandatory privacy header', async () => {
    const httpClient = createHttpClient();
    httpClient.post.mockResolvedValue({
      data: { group: [] },
      headers: {} as Record<string, string>,
    });
    const client = createHuaweiHealthClient({
      httpClient,
      randomUUID: () => 'trace-id',
    });

    await expect(
      client.fetchDailySummary('access-token', {
        dataTypes: ['com.huawei.continuous.steps.delta'],
        startDay: '20260701',
        endDay: '20260707',
        timeZone: '+0300',
      })
    ).rejects.toMatchObject({
      code: 'HUAWEI_API_RESPONSE_INVALID',
      statusCode: 502,
    });
  });

  it('honors the Huawei privacy header on rejected HTTP responses', async () => {
    const httpClient = createHttpClient();
    httpClient.post.mockRejectedValue({
      response: { headers: { 'x-health-app-privacy': '2' } },
    });
    const client = createHuaweiHealthClient({
      httpClient,
      randomUUID: () => 'trace-id',
    });

    await expect(
      client.fetchDailySummary('access-token', {
        dataTypes: ['com.huawei.continuous.steps.delta'],
        startDay: '20260701',
        endDay: '20260707',
        timeZone: '+0300',
      })
    ).rejects.toMatchObject({
      code: 'HUAWEI_PRIVACY_DISABLED',
      statusCode: 403,
    });
  });

  it('reads the live granted-scope list used for partial authorization', async () => {
    process.env.SPARKY_FITNESS_HUAWEI_HEALTH_APP_ID = 'health-app-id';
    const httpClient = createHttpClient();
    httpClient.get.mockResolvedValue({
      data: {
        url2Desc: {
          'https://www.huawei.com/healthkit/step.read': 'Steps',
          'https://www.huawei.com/healthkit/sleep.read': 'Sleep',
        },
        authTime: '1783684800',
        appName: 'SparkyFitness',
      },
      headers: { 'x-health-app-privacy': '1' },
    });
    const client = createHuaweiHealthClient({
      httpClient,
      randomUUID: () => 'trace-id',
    });

    await expect(client.fetchGrantedScopes('access-token')).resolves.toEqual([
      'https://www.huawei.com/healthkit/step.read',
      'https://www.huawei.com/healthkit/sleep.read',
    ]);
    expect(httpClient.get).toHaveBeenCalledWith(
      'https://health-api.cloud.huawei.com/healthkit/v2/consents/health-app-id',
      {
        timeout: 15_000,
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        params: { lang: 'en' },
      }
    );
  });

  it('rejects malformed provider payloads at the HTTP boundary', async () => {
    const httpClient = createHttpClient();
    httpClient.post.mockResolvedValue({
      data: { group: [{ startTime: 'bad', sampleSet: 'not-an-array' }] },
      headers: { 'x-health-app-privacy': '1' },
    });
    const client = createHuaweiHealthClient({
      httpClient,
      randomUUID: () => 'trace-id',
    });

    await expect(
      client.fetchDailySummary('access-token', {
        dataTypes: ['com.huawei.continuous.steps.total'],
        startDay: '20260701',
        endDay: '20260707',
        timeZone: '+0300',
      })
    ).rejects.toMatchObject({
      code: 'HUAWEI_API_RESPONSE_INVALID',
      statusCode: 502,
    });
  });
});
