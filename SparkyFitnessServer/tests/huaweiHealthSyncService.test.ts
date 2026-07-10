import { describe, expect, it, vi } from 'vitest';
import {
  createHuaweiHealthSyncService,
  splitHuaweiDayRange,
} from '../integrations/huaweihealth/huaweiHealthSyncService.js';
import type {
  HuaweiActivitiesResponse,
  HuaweiDailySummaryResponse,
  HuaweiSleepRecordsResponse,
} from '../integrations/huaweihealth/huaweiHealthApiSchemas.js';

function createDependencies() {
  return {
    oauthService: {
      getStatus: vi.fn(
        async (): Promise<{
          available: boolean;
          connected: boolean;
          isActive: boolean;
          lastSyncAt: Date | null;
          tokenExpiresAt: Date | null;
          grantedScopes: string[];
        }> => ({
          available: true,
          connected: true,
          isActive: true,
          lastSyncAt: null,
          tokenExpiresAt: new Date('2026-07-10T13:00:00.000Z'),
          grantedScopes: [
            'openid',
            'https://www.huawei.com/healthkit/step.read',
          ],
        })
      ),
      getValidAccessToken: vi.fn(async () => 'access-token'),
    },
    client: {
      fetchGrantedScopes: vi.fn(async () => [
        'https://www.huawei.com/healthkit/step.read',
      ]),
      fetchDailySummary: vi.fn(
        async (): Promise<HuaweiDailySummaryResponse> => ({ group: [] })
      ),
      fetchSleepRecords: vi.fn(
        async (): Promise<HuaweiSleepRecordsResponse> => ({
          healthRecords: [],
        })
      ),
      fetchActivities: vi.fn(
        async (): Promise<HuaweiActivitiesResponse> => ({
          activityRecord: [],
          deletedActivityRecord: [],
        })
      ),
    },
    processHealthData: vi.fn(
      async (): Promise<{
        processed: unknown[];
        errors: unknown[];
        skipped: unknown[];
      }> => ({
        processed: [],
        errors: [],
        skipped: [],
      })
    ),
    loadUserTimezone: vi.fn(async () => 'Asia/Riyadh'),
    updateLastSync: vi.fn(async () => undefined),
    updateGrantedScopes: vi.fn(async () => undefined),
    deleteWorkoutsByRange: vi.fn(async () => undefined),
    now: vi.fn(() => new Date('2026-07-10T12:00:00.000Z')),
  };
}

describe('Huawei Health sync service', () => {
  it('keeps API intervals below 31 elapsed days and splits on DST offsets', () => {
    expect(splitHuaweiDayRange('2026-01-01', '2026-03-10')).toEqual([
      { startDate: '2026-01-01', endDate: '2026-01-30' },
      { startDate: '2026-01-31', endDate: '2026-03-01' },
      { startDate: '2026-03-02', endDate: '2026-03-10' },
    ]);
    expect(
      splitHuaweiDayRange('2026-03-01', '2026-03-31', 'America/New_York')
    ).toEqual([
      { startDate: '2026-03-01', endDate: '2026-03-08' },
      { startDate: '2026-03-09', endDate: '2026-03-31' },
    ]);
  });

  it('defaults to seven local calendar days and requests only granted metric scopes', async () => {
    const dependencies = createDependencies();
    const service = createHuaweiHealthSyncService(dependencies);

    const result = await service.sync('user-1', 'user-1');

    expect(dependencies.client.fetchDailySummary).toHaveBeenCalledWith(
      'access-token',
      {
        dataTypes: ['com.huawei.continuous.steps.delta'],
        startDay: '20260704',
        endDay: '20260710',
        timeZone: '+0300',
      }
    );
    expect(dependencies.client.fetchSleepRecords).not.toHaveBeenCalled();
    expect(dependencies.client.fetchActivities).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'completed',
      startDate: '2026-07-04',
      endDate: '2026-07-10',
      processed: 0,
      errors: 0,
      skipped: 0,
      missingScopes: expect.arrayContaining([
        'https://www.huawei.com/healthkit/sleep.read',
        'https://www.huawei.com/healthkit/activityrecord.read',
      ]),
    });
    expect(dependencies.updateLastSync).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      new Date('2026-07-10T12:00:00.000Z')
    );
    expect(dependencies.updateGrantedScopes).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      ['https://www.huawei.com/healthkit/step.read']
    );
  });

  it('maps all granted response families through the existing health ingest pipeline', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.oauthService.getStatus).mockResolvedValue({
      available: true,
      connected: true,
      isActive: true,
      lastSyncAt: null,
      tokenExpiresAt: null,
      grantedScopes: [
        'openid',
        'https://www.huawei.com/healthkit/step.read',
        'https://www.huawei.com/healthkit/sleep.read',
        'https://www.huawei.com/healthkit/activityrecord.read',
      ],
    });
    vi.mocked(dependencies.client.fetchGrantedScopes).mockResolvedValue([
      'https://www.huawei.com/healthkit/step.read',
      'https://www.huawei.com/healthkit/sleep.read',
      'https://www.huawei.com/healthkit/activityrecord.read',
    ]);
    vi.mocked(dependencies.client.fetchDailySummary).mockResolvedValue({
      group: [
        {
          startTime: Date.parse('2026-07-09T00:00:00.000Z'),
          sampleSet: [
            {
              samplePoints: [
                {
                  dataTypeName: 'com.huawei.continuous.steps.total',
                  value: [{ fieldName: 'steps', integerValue: 9000 }],
                },
              ],
            },
          ],
        },
      ],
    });
    vi.mocked(dependencies.client.fetchSleepRecords).mockResolvedValue({
      healthRecords: [],
    });
    vi.mocked(dependencies.client.fetchActivities).mockResolvedValue({
      activityRecord: [],
      deletedActivityRecord: [],
    });
    vi.mocked(dependencies.processHealthData).mockResolvedValue({
      processed: [{ type: 'steps' }],
      errors: [],
      skipped: [],
    });
    const service = createHuaweiHealthSyncService(dependencies);

    const result = await service.sync('user-1', 'user-1', {
      startDate: '2026-07-09',
      endDate: '2026-07-10',
    });

    expect(dependencies.client.fetchSleepRecords).toHaveBeenCalledOnce();
    expect(dependencies.client.fetchActivities).toHaveBeenCalledOnce();
    expect(dependencies.deleteWorkoutsByRange).toHaveBeenCalledWith(
      'user-1',
      '2026-07-09',
      '2026-07-10',
      'HUAWEI Health'
    );
    expect(dependencies.processHealthData).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: 'steps',
          value: 9000,
          source: 'HUAWEI Health',
        }),
      ],
      'user-1',
      'user-1'
    );
    expect(result.processed).toBe(1);
  });

  it('refuses to sync a disconnected account before making health API calls', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.oauthService.getStatus).mockResolvedValue({
      available: true,
      connected: false,
      isActive: false,
      lastSyncAt: null,
      tokenExpiresAt: null,
      grantedScopes: [],
    });
    const service = createHuaweiHealthSyncService(dependencies);

    await expect(service.sync('user-1', 'user-1')).rejects.toMatchObject({
      code: 'HUAWEI_NOT_CONNECTED',
      statusCode: 409,
    });
    expect(dependencies.client.fetchDailySummary).not.toHaveBeenCalled();
  });
});
