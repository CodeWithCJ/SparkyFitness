import {
  getSettings,
  putSettings,
  getOverview,
  listLogs,
  getLog,
  putLog,
  deleteLog,
  listCycles,
  bulkPutLogs,
  createManualCycle,
  updateCycle,
  deleteCycle,
  getInsights,
  listTestEntries,
  createTestEntry,
  deleteTestEntry,
  getFertility,
  getCorrelations,
  getExport,
  upsertBbt,
} from '../../../src/services/api/cycleApi';
import { apiFetch } from '../../../src/services/api/apiClient';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue({});
});

describe('wire contract', () => {
  const cases: [string, () => Promise<unknown>, Record<string, unknown>][] = [
    ['getSettings', () => getSettings(), { endpoint: '/api/v2/cycle/settings' }],
    [
      'putSettings',
      () => putSettings({ mode: 'ttc', mark_onboarded: true }),
      {
        endpoint: '/api/v2/cycle/settings',
        method: 'PUT',
        body: { mode: 'ttc', mark_onboarded: true },
      },
    ],
    ['getOverview without date', () => getOverview(), { endpoint: '/api/v2/cycle/overview' }],
    [
      'listLogs',
      () => listLogs('2024-06-01', '2024-06-30'),
      { endpoint: '/api/v2/cycle/logs?startDate=2024-06-01&endDate=2024-06-30' },
    ],
    ['getLog', () => getLog('2024-06-15'), { endpoint: '/api/v2/cycle/logs/2024-06-15' }],
    [
      'putLog',
      () => putLog('2024-06-15', { flow_level: 'medium' }),
      {
        endpoint: '/api/v2/cycle/logs/2024-06-15',
        method: 'PUT',
        body: { flow_level: 'medium' },
      },
    ],
    [
      'deleteLog',
      () => deleteLog('2024-06-15'),
      { endpoint: '/api/v2/cycle/logs/2024-06-15', method: 'DELETE' },
    ],
    ['listCycles without limit', () => listCycles(), { endpoint: '/api/v2/cycle/cycles' }],
    ['listCycles with limit', () => listCycles(6), { endpoint: '/api/v2/cycle/cycles?limit=6' }],
    [
      'bulkPutLogs',
      () => bulkPutLogs([{ date: '2024-06-15', flow_level: null }]),
      {
        endpoint: '/api/v2/cycle/logs',
        method: 'PUT',
        body: [{ date: '2024-06-15', flow_level: null }],
      },
    ],
    [
      'createManualCycle',
      () => createManualCycle({ start_date: '2024-06-01' }),
      { endpoint: '/api/v2/cycle/cycles', method: 'POST', body: { start_date: '2024-06-01' } },
    ],
    [
      'updateCycle',
      () => updateCycle('cycle-1', { period_length: 5 }),
      { endpoint: '/api/v2/cycle/cycles/cycle-1', method: 'PUT', body: { period_length: 5 } },
    ],
    [
      'deleteCycle',
      () => deleteCycle('cycle-1'),
      { endpoint: '/api/v2/cycle/cycles/cycle-1', method: 'DELETE' },
    ],
    ['getInsights', () => getInsights(), { endpoint: '/api/v2/cycle/insights' }],
    [
      'listTestEntries',
      () => listTestEntries('2024-06-01', '2024-06-30'),
      { endpoint: '/api/v2/cycle/tests?startDate=2024-06-01&endDate=2024-06-30' },
    ],
    [
      'createTestEntry',
      () => createTestEntry({ test_type: 'opk', result: 'peak', entry_date: '2024-06-15' }),
      {
        endpoint: '/api/v2/cycle/tests',
        method: 'POST',
        body: { test_type: 'opk', result: 'peak', entry_date: '2024-06-15' },
      },
    ],
    [
      'deleteTestEntry',
      () => deleteTestEntry('test-1'),
      { endpoint: '/api/v2/cycle/tests/test-1', method: 'DELETE' },
    ],
    ['getFertility without date', () => getFertility(), { endpoint: '/api/v2/cycle/fertility' }],
    ['getCorrelations', () => getCorrelations(), { endpoint: '/api/v2/cycle/correlations' }],
    ['getExport', () => getExport(), { endpoint: '/api/v2/cycle/export' }],
  ];

  test.each(cases)('%s', async (_name, call, expected) => {
    await call();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  test('date query params are URI-encoded', async () => {
    await getOverview('2024-06-15T00:00');

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/api/v2/cycle/overview?date=2024-06-15T00%3A00' }),
    );
  });
});

describe('upsertBbt', () => {
  const BBT_CATEGORY = { id: 'cat-bbt', name: 'basal_body_temperature' };
  const CATEGORIES_ENDPOINT = '/api/measurements/custom-categories';

  type FetchArgs = Parameters<typeof apiFetch>[0];
  const callsTo = (endpoint: string, method?: string): FetchArgs[] =>
    mockApiFetch.mock.calls
      .map(([args]) => args)
      .filter((args) => args.endpoint === endpoint && args.method === method);

  test('reuses an existing category and posts the value as a string', async () => {
    mockApiFetch.mockImplementation(async (args) => {
      if (args.endpoint === CATEGORIES_ENDPOINT && !args.method) return [BBT_CATEGORY];
      return undefined;
    });

    await upsertBbt('2024-06-15', 36.7);

    expect(callsTo(CATEGORIES_ENDPOINT, 'POST')).toHaveLength(0);
    expect(callsTo('/api/measurements/custom-entries', 'POST')[0]?.body).toEqual({
      category_id: 'cat-bbt',
      value: '36.7',
      entry_date: '2024-06-15',
      source: 'manual',
    });
  });

  test('creates the category when it does not exist yet', async () => {
    mockApiFetch.mockImplementation(async (args) => {
      if (args.endpoint === CATEGORIES_ENDPOINT && !args.method) return [];
      if (args.endpoint === CATEGORIES_ENDPOINT && args.method === 'POST') return BBT_CATEGORY;
      return undefined;
    });

    await upsertBbt('2024-06-15', 36.7);

    expect(callsTo(CATEGORIES_ENDPOINT, 'POST')[0]?.body).toMatchObject({
      name: 'basal_body_temperature',
    });
    expect(callsTo('/api/measurements/custom-entries', 'POST')[0]?.body).toMatchObject({
      category_id: 'cat-bbt',
    });
  });

  test('recovers when a concurrent call created the category first', async () => {
    let listCalls = 0;
    mockApiFetch.mockImplementation(async (args) => {
      if (args.endpoint === CATEGORIES_ENDPOINT && !args.method) {
        listCalls += 1;
        return listCalls === 1 ? [] : [BBT_CATEGORY];
      }
      if (args.endpoint === CATEGORIES_ENDPOINT && args.method === 'POST') {
        throw new Error('duplicate category');
      }
      return undefined;
    });

    await upsertBbt('2024-06-15', 36.7);

    expect(callsTo('/api/measurements/custom-entries', 'POST')[0]?.body).toMatchObject({
      category_id: 'cat-bbt',
    });
  });

  test('rethrows the create error when the category is still missing after re-listing', async () => {
    const createError = new Error('server rejected category');
    mockApiFetch.mockImplementation(async (args) => {
      if (args.endpoint === CATEGORIES_ENDPOINT && !args.method) return [];
      if (args.endpoint === CATEGORIES_ENDPOINT && args.method === 'POST') throw createError;
      return undefined;
    });

    await expect(upsertBbt('2024-06-15', 36.7)).rejects.toBe(createError);
    expect(callsTo('/api/measurements/custom-entries', 'POST')).toHaveLength(0);
  });

  test('null value deletes the existing BBT entry for that day', async () => {
    mockApiFetch.mockImplementation(async (args) => {
      if (args.endpoint === CATEGORIES_ENDPOINT && !args.method) return [BBT_CATEGORY];
      if (args.endpoint === '/api/measurements/custom-entries/2024-06-15') {
        return [
          { id: 'entry-other', category_id: 'cat-other', entry_date: '2024-06-15' },
          { id: 'entry-bbt', category_id: 'cat-bbt', entry_date: '2024-06-15' },
        ];
      }
      return undefined;
    });

    await upsertBbt('2024-06-15', null);

    expect(callsTo('/api/measurements/custom-entries/entry-bbt', 'DELETE')).toHaveLength(1);
    expect(callsTo('/api/measurements/custom-entries/entry-other', 'DELETE')).toHaveLength(0);
    expect(callsTo('/api/measurements/custom-entries', 'POST')).toHaveLength(0);
  });

  test('null value with no BBT entry for the day issues no delete', async () => {
    mockApiFetch.mockImplementation(async (args) => {
      if (args.endpoint === CATEGORIES_ENDPOINT && !args.method) return [BBT_CATEGORY];
      if (args.endpoint === '/api/measurements/custom-entries/2024-06-15') return [];
      return undefined;
    });

    await upsertBbt('2024-06-15', null);

    const deletes = mockApiFetch.mock.calls.filter(([args]) => args.method === 'DELETE');
    expect(deletes).toHaveLength(0);
  });
});
