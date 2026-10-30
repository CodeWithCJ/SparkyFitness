import { vi, beforeEach, describe, expect, it } from 'vitest';

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
});
