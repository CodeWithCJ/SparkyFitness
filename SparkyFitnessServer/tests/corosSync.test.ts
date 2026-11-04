import { vi, beforeEach, describe, expect, it } from 'vitest';
import { log } from '../config/logging.js';
import { loadRawBundle } from '../utils/diagnosticLogger.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const MOCK_SPORT_PAYLOAD = {
  content: [
    {
      type: 'text',
      text: 'Sport Records — 2024-12-01 to 2024-12-31 (1 records)\n========================\n\n1. Indoor Run — 2024-12-21\n   Location: Indoor Run\n   Time Window: startTimestamp=1734814685 | endTimestamp=1734816535\n   Duration: 30:16 | Distance: 3.74 km\n   Average Pace: 8:05 /km | Avg HR: 134 bpm | Calories: 300 kcal\n   LabelId: 480644884506640590 | SportType: 101',
    },
  ],
  isError: false,
};

const MOCK_FIT_PAYLOAD = {
  content: [
    {
      type: 'text',
      text: 'Returned raw FIT file(s).',
    },
    {
      type: 'resource',
      resource: {
        uri: 'coros://activity-fit-files/480644884506640590.fit',
        mimeType: 'application/octet-stream',
        _meta: {
          labelId: '480644884506640590',
          sportType: 101,
          fileName: '480644884506640590.fit',
          fileType: 4,
        },
        blob: Buffer.from('mock-fit-data').toString('base64'),
      },
    },
  ],
  isError: false,
};

const mockDb = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(async () => mockDb),
  getClient: vi.fn(async () => mockDb),
}));

vi.mock('../config/db.js', () => ({
  default: mockDb,
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../utils/diagnosticLogger.js', () => ({
  loadRawBundle: vi.fn(),
  logRawResponse: vi.fn(),
}));

const mockCorosIntegration = {
  withCorosMcp: vi.fn(),
  getValidAccessToken: vi.fn(),
};

vi.mock('../integrations/coros/corosService.js', () => ({
  default: mockCorosIntegration,
  CorosReauthRequiredError: class CorosReauthRequiredError extends Error {},
}));

const mockDataProcessor = {
  importCorosActivityFromFit: vi.fn(),
  importCorosActivitySummary: vi.fn(),
};

vi.mock('../integrations/coros/corosDataProcessor.js', () => mockDataProcessor);

const mockExerciseEntry = {
  getExistingSourceIds: vi.fn(),
};

vi.mock('../models/exerciseEntry.js', () => mockExerciseEntry);

const mockFitBudget = {
  reserveFitDownload: vi.fn(),
  releaseFitDownload: vi.fn(),
};

vi.mock('../models/corosFitBudgetRepository.js', () => mockFitBudget);

const TWO_RECORDS_PAYLOAD = {
  content: [
    {
      type: 'text',
      text: 'Sport Records — 2024-12-01 to 2024-12-31 (2 records)\n========================\n\n1. Indoor Run — 2024-12-21\n   Time Window: startTimestamp=1734814685 | endTimestamp=1734816535\n   LabelId: 480644884506640590 | SportType: 101\n\n2. Outdoor Run — 2024-12-20\n   Time Window: startTimestamp=1734728285 | endTimestamp=1734730135\n   LabelId: 480644884506640591 | SportType: 100',
    },
  ],
  isError: false,
};

function mcpReturning(
  records: unknown,
  download: () => Promise<unknown>
): ReturnType<typeof vi.fn> {
  const call = vi.fn().mockImplementation(async (name: string) => {
    if (name === 'querySportRecords') return records;
    if (name === 'downloadActivityFitFiles') return download();
    return { content: [{ type: 'text', text: '{}' }] };
  });
  mockCorosIntegration.withCorosMcp.mockImplementation(
    async (_userId, _providerId, fn) => fn(call)
  );
  return call;
}

const countDownloads = (call: ReturnType<typeof vi.fn>) =>
  call.mock.calls.filter(([name]) => name === 'downloadActivityFitFiles')
    .length;

const { syncCorosData } = await import('../services/corosService.js');

describe('corosService syncCorosData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExerciseEntry.getExistingSourceIds.mockResolvedValue(new Set());
    mockFitBudget.reserveFitDownload.mockResolvedValue({
      day: '2026-10-16',
      used: 1,
    });
    mockFitBudget.releaseFitDownload.mockResolvedValue(undefined);
    mockDb.query.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('external_data_providers')) {
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              base_url: 'https://mcpus.coros.com/mcp',
              client_id: 'test-client',
              provider_type: 'coros_mcp',
              is_active: true,
              encrypted_access_token: 'enc-token',
            },
          ],
        };
      }
      return { rows: [] };
    });
  });

  it('handles empty activity list gracefully', async () => {
    mockCorosIntegration.withCorosMcp.mockImplementation(
      async (_userId, _providerId, fn) => {
        const mockCall = vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '{"data": {"dataList": []}}' }],
        });
        return fn(mockCall);
      }
    );

    const result = await syncCorosData(
      USER_ID,
      'manual',
      null,
      '2026-09-01',
      '2026-09-27'
    );

    expect(result.success).toBe(true);
    expect(result.imported).toBe(0);
  });

  it('downloads FIT files and imports activities with telemetry', async () => {
    mockCorosIntegration.withCorosMcp.mockImplementation(
      async (_userId, _providerId, fn) => {
        const mockCall = vi.fn().mockImplementation(async (name) => {
          if (
            name === 'coros_query_sport_data' ||
            name === 'querySportRecords'
          ) {
            return MOCK_SPORT_PAYLOAD;
          }
          if (
            name === 'downloadActivityFitFiles' ||
            name === 'downloadFitFile' ||
            name === 'coros_download_fit_file'
          ) {
            return MOCK_FIT_PAYLOAD;
          }
          return { content: [{ type: 'text', text: '{}' }] };
        });
        return fn(mockCall);
      }
    );

    mockDataProcessor.importCorosActivityFromFit.mockResolvedValue({
      status: 'created',
    });

    const result = await syncCorosData(
      USER_ID,
      'manual',
      null,
      '2024-12-01',
      '2024-12-31'
    );

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    expect(mockDataProcessor.importCorosActivityFromFit).toHaveBeenCalledTimes(
      1
    );
  });

  it('skips activities that were already imported', async () => {
    mockExerciseEntry.getExistingSourceIds.mockResolvedValue(
      new Set(['480644884506640590'])
    );

    mockCorosIntegration.withCorosMcp.mockImplementation(
      async (_userId, _providerId, fn) => {
        const mockCall = vi.fn().mockResolvedValue(MOCK_SPORT_PAYLOAD);
        return fn(mockCall);
      }
    );

    const result = await syncCorosData(
      USER_ID,
      'manual',
      null,
      '2024-12-01',
      '2024-12-31'
    );

    expect(result.success).toBe(true);
    expect(result.imported).toBe(0);
    expect(mockDataProcessor.importCorosActivityFromFit).not.toHaveBeenCalled();
  });

  describe('daily FIT download budget on the provider row', () => {
    beforeEach(() => {
      mockDataProcessor.importCorosActivityFromFit.mockResolvedValue({
        status: 'created',
      });
    });

    it('takes one download from the provider row before each FIT request', async () => {
      const call = mcpReturning(
        TWO_RECORDS_PAYLOAD,
        async () => MOCK_FIT_PAYLOAD
      );

      const result = await syncCorosData(
        USER_ID,
        'manual',
        null,
        '2024-12-01',
        '2024-12-31'
      );

      expect(result.imported).toBe(2);
      expect(countDownloads(call)).toBe(2);
      expect(mockFitBudget.reserveFitDownload).toHaveBeenCalledTimes(2);
      expect(mockFitBudget.reserveFitDownload).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        45
      );
      expect(mockFitBudget.releaseFitDownload).not.toHaveBeenCalled();
    });

    it('defers every download when another server already spent today’s budget', async () => {
      mockFitBudget.reserveFitDownload.mockResolvedValue(null);
      const call = mcpReturning(
        TWO_RECORDS_PAYLOAD,
        async () => MOCK_FIT_PAYLOAD
      );

      const result = await syncCorosData(
        USER_ID,
        'scheduled',
        null,
        '2024-12-01',
        '2024-12-31'
      );

      expect(countDownloads(call)).toBe(0);
      expect(result.deferred).toBe(2);
      expect(result.imported).toBe(0);
      // Spent once means spent for the rest of this sync: no second query.
      expect(mockFitBudget.reserveFitDownload).toHaveBeenCalledTimes(1);
      expect(result.warnings).toContain(
        'Daily COROS file download limit reached. Remaining activities will be imported after the limit resets (next UTC day).'
      );
    });

    it('stops after the download that used the last of the budget', async () => {
      mockFitBudget.reserveFitDownload.mockResolvedValueOnce({
        day: '2026-10-16',
        used: 45,
      });
      const call = mcpReturning(
        TWO_RECORDS_PAYLOAD,
        async () => MOCK_FIT_PAYLOAD
      );

      const result = await syncCorosData(
        USER_ID,
        'manual',
        null,
        '2024-12-01',
        '2024-12-31'
      );

      expect(countDownloads(call)).toBe(1);
      expect(mockFitBudget.reserveFitDownload).toHaveBeenCalledTimes(1);
      expect(result.imported).toBe(1);
      expect(result.deferred).toBe(1);
      expect(result.warnings).toContain(
        'Daily COROS file download limit reached. Remaining activities will be imported after the limit resets (next UTC day).'
      );
    });

    it('gives the download back when the request failed', async () => {
      mockFitBudget.reserveFitDownload.mockResolvedValue({
        day: '2026-10-16',
        used: 45,
      });
      const call = mcpReturning(TWO_RECORDS_PAYLOAD, async () => {
        throw new Error('socket hang up');
      });

      const result = await syncCorosData(
        USER_ID,
        'manual',
        null,
        '2024-12-01',
        '2024-12-31'
      );

      // A failed request does not count, so the 45th slot is tried again.
      expect(countDownloads(call)).toBe(2);
      expect(mockFitBudget.releaseFitDownload).toHaveBeenCalledTimes(2);
      expect(mockFitBudget.releaseFitDownload).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        '2026-10-16'
      );
      expect(result.deferred).toBe(2);
      expect(result.warnings).not.toContain(
        'Daily COROS file download limit reached. Remaining activities will be imported after the limit resets (next UTC day).'
      );
    });

    it('keeps a download COROS answered, even with a limit error', async () => {
      const call = mcpReturning(TWO_RECORDS_PAYLOAD, async () => ({
        content: [{ type: 'text', text: 'Daily download limit exceeded' }],
        isError: true,
      }));

      const result = await syncCorosData(
        USER_ID,
        'manual',
        null,
        '2024-12-01',
        '2024-12-31'
      );

      expect(countDownloads(call)).toBe(1);
      expect(mockFitBudget.releaseFitDownload).not.toHaveBeenCalled();
      expect(result.deferred).toBe(2);
    });
  });

  describe('last_sync_at', () => {
    const lastSyncUpdates = () =>
      mockDb.query.mock.calls.filter(([sql]) =>
        String(sql).includes('last_sync_at')
      );
    const sync = () =>
      syncCorosData(USER_ID, 'manual', null, '2024-12-01', '2024-12-31');
    const noFit = async () => ({ content: [], isError: false });

    beforeEach(() => {
      mockDataProcessor.importCorosActivityFromFit.mockResolvedValue({
        status: 'created',
      });
      mockDataProcessor.importCorosActivitySummary.mockResolvedValue({
        id: 'entry-1',
      });
    });

    it('updates it after a successful query', async () => {
      mcpReturning(MOCK_SPORT_PAYLOAD, async () => MOCK_FIT_PAYLOAD);

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([]);
      expect(result.activitiesFailed).toBe(0);
      expect(result.imported).toBe(1);
      expect(lastSyncUpdates()).toHaveLength(1);
    });

    it('leaves it alone and keeps the warning when the query reports an error', async () => {
      mcpReturning(
        {
          content: [{ type: 'text', text: 'Tool call anomalies detected' }],
          isError: false,
        },
        noFit
      );

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([
        'querySportRecords 2024-12-01..2024-12-31',
      ]);
      expect(result.warnings).toEqual([
        expect.stringContaining('Warning from COROS query'),
      ]);
      expect(lastSyncUpdates()).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('last_sync_at not updated')
      );
    });

    it('leaves it alone when isError comes without a text report', async () => {
      mcpReturning(
        {
          content: [{ type: 'text', text: '{"code": 500}' }],
          isError: true,
        },
        noFit
      );

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([
        'querySportRecords 2024-12-01..2024-12-31',
      ]);
      expect(result.warnings).toHaveLength(1);
      expect(lastSyncUpdates()).toHaveLength(0);
    });

    it('does not treat an empty result as an error', async () => {
      mcpReturning(
        {
          content: [{ type: 'text', text: 'No sport records found' }],
          isError: false,
        },
        noFit
      );

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([]);
      expect(lastSyncUpdates()).toHaveLength(1);
    });

    it('notices an error after a window split and keeps the other half', async () => {
      const call = vi
        .fn()
        .mockImplementation(
          async (
            name: string,
            args: { startDate: string; endDate: string }
          ) => {
            if (name !== 'querySportRecords') return MOCK_FIT_PAYLOAD;
            if (args.startDate === '20241201' && args.endDate === '20241231') {
              return {
                content: [
                  { type: 'text', text: 'Sport Records (100 records)' },
                ],
                isError: false,
              };
            }
            if (args.startDate === '20241201') return MOCK_SPORT_PAYLOAD;
            return {
              content: [{ type: 'text', text: 'Rate limit exceeded' }],
              isError: false,
            };
          }
        );
      mockCorosIntegration.withCorosMcp.mockImplementation(
        async (_userId, _providerId, fn) => fn(call)
      );

      const result = await sync();

      expect(result.failedRequiredFetches).toEqual([
        'querySportRecords 2024-12-17..2024-12-31',
      ]);
      expect(result.imported).toBe(1);
      expect(lastSyncUpdates()).toHaveLength(0);
    });

    it('counts an activity whose entry cannot be saved as failed', async () => {
      mockDataProcessor.importCorosActivitySummary.mockRejectedValueOnce(
        new Error('insert failed')
      );
      mcpReturning(MOCK_SPORT_PAYLOAD, noFit);

      const result = await sync();

      expect(result.activitiesFailed).toBe(1);
      expect(result.deferred).toBe(0);
      expect(result.summaryOnly).toBe(0);
      expect(mockFitBudget.releaseFitDownload).not.toHaveBeenCalled();
      expect(lastSyncUpdates()).toHaveLength(0);
    });

    it('counts it as failed when the summary fallback after a bad FIT fails too', async () => {
      mockDataProcessor.importCorosActivityFromFit.mockResolvedValueOnce({
        status: 'failed',
        reason: 'database down',
      });
      mockDataProcessor.importCorosActivitySummary.mockRejectedValueOnce(
        new Error('insert failed')
      );
      mcpReturning(MOCK_SPORT_PAYLOAD, async () => MOCK_FIT_PAYLOAD);

      const result = await sync();

      expect(result.activitiesFailed).toBe(1);
      expect(lastSyncUpdates()).toHaveLength(0);
    });

    it('does not block it when a summary entry replaces a bad FIT', async () => {
      mockDataProcessor.importCorosActivityFromFit.mockResolvedValueOnce({
        status: 'failed',
        reason: 'Not a FIT file.',
      });
      mcpReturning(MOCK_SPORT_PAYLOAD, async () => MOCK_FIT_PAYLOAD);

      const result = await sync();

      expect(result.summaryOnly).toBe(1);
      expect(result.activitiesFailed).toBe(0);
      expect(lastSyncUpdates()).toHaveLength(1);
    });

    it('leaves it alone and names the deferred download when a download fails', async () => {
      mcpReturning(MOCK_SPORT_PAYLOAD, async () => {
        throw new Error('socket hang up');
      });

      const result = await sync();

      expect(result.deferred).toBe(1);
      expect(result.activitiesFailed).toBe(0);
      expect(lastSyncUpdates()).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('deferred downloads: 1')
      );
    });

    it('leaves it alone when COROS answers a download with a tool error', async () => {
      mcpReturning(MOCK_SPORT_PAYLOAD, async () => ({
        content: [{ type: 'text', text: 'Tool call anomalies detected' }],
        isError: true,
      }));

      const result = await sync();

      expect(result.deferred).toBe(1);
      expect(lastSyncUpdates()).toHaveLength(0);
    });

    it('leaves it alone when COROS answers a download with a limit error', async () => {
      mcpReturning(MOCK_SPORT_PAYLOAD, async () => ({
        content: [{ type: 'text', text: 'Daily download limit exceeded' }],
        isError: true,
      }));

      const result = await sync();

      expect(result.deferred).toBe(1);
      expect(lastSyncUpdates()).toHaveLength(0);
    });

    it('leaves it alone when the daily budget is already spent', async () => {
      mockFitBudget.reserveFitDownload.mockResolvedValue(null);
      const call = mcpReturning(
        MOCK_SPORT_PAYLOAD,
        async () => MOCK_FIT_PAYLOAD
      );

      const result = await sync();

      expect(countDownloads(call)).toBe(0);
      expect(result.deferred).toBe(1);
      expect(lastSyncUpdates()).toHaveLength(0);
    });

    it('leaves it alone when the last of the budget runs out mid-sync, and keeps the import', async () => {
      mockFitBudget.reserveFitDownload.mockResolvedValue({
        day: '2026-10-16',
        used: 45,
      });
      mcpReturning(TWO_RECORDS_PAYLOAD, async () => MOCK_FIT_PAYLOAD);

      const result = await sync();

      expect(result.imported).toBe(1);
      expect(result.deferred).toBe(1);
      expect(lastSyncUpdates()).toHaveLength(0);
    });

    it('updates it when an activity already imported is the only one left', async () => {
      mockExerciseEntry.getExistingSourceIds.mockResolvedValue(
        new Set(['480644884506640590'])
      );
      mcpReturning(MOCK_SPORT_PAYLOAD, noFit);

      const result = await sync();

      expect(result.skippedExisting).toBe(1);
      expect(result.deferred).toBe(0);
      expect(lastSyncUpdates()).toHaveLength(1);
    });

    it('does not touch it when replaying a raw bundle', async () => {
      vi.mocked(loadRawBundle).mockReturnValueOnce({
        responses: { raw_sport_records_1: { data: MOCK_SPORT_PAYLOAD } },
      });

      const result = await syncCorosData(
        USER_ID,
        'manual',
        null,
        '2024-12-01',
        '2024-12-31',
        'local'
      );

      expect(result.source).toBe('local_raw_replay');
      expect(result.summaryOnly).toBe(1);
      expect(lastSyncUpdates()).toHaveLength(0);
    });
  });
});
