import {
  upsertCheckIn,
  fetchMeasurements,
  fetchWaterIntakeRange,
  fetchLatestCheckInMeasurementsOnOrBefore,
  fetchLatestManualCustomEntriesOnOrBefore,
  serverSupportsPerRecordWater,
} from '../../../src/services/api/measurementsApi';
import { apiFetch } from '../../../src/services/api/apiClient';
import { ApiError } from '../../../src/services/api/errors';
import type { CheckInMeasurementRange } from '../../../src/types/measurements';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const lastBody = (): Record<string, unknown> => {
  const call = mockApiFetch.mock.calls.at(-1)?.[0] as {
    body: Record<string, unknown>;
  };
  return call.body;
};

describe('upsertCheckIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockResolvedValue({});
  });

  test('posts to the check-in endpoint with snake_case fields', async () => {
    await upsertCheckIn({
      entryDate: '2024-06-15',
      weight: 80.5,
      bodyFatPercentage: 22.5,
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/measurements/check-in',
        method: 'POST',
      })
    );
    expect(lastBody()).toMatchObject({
      entry_date: '2024-06-15',
      weight: 80.5,
      body_fat_percentage: 22.5,
    });
  });

  test('omitted fields disappear from the serialized body, so the server leaves them unchanged', async () => {
    await upsertCheckIn({ entryDate: '2024-06-15', weight: 80.5 });

    // JSON.stringify strips undefined-valued keys — this is the wire contract.
    const serialized = JSON.parse(JSON.stringify(lastBody()));
    expect(serialized).toEqual({ entry_date: '2024-06-15', weight: 80.5 });
  });

  test('null fields survive serialization, so the server clears them', async () => {
    await upsertCheckIn({ entryDate: '2024-06-15', weight: null, steps: 9000 });

    const serialized = JSON.parse(JSON.stringify(lastBody()));
    expect(serialized).toEqual({
      entry_date: '2024-06-15',
      weight: null,
      steps: 9000,
    });
  });
});

describe('fetchMeasurements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('queries the range endpoint for a single day instead of the carry-forward check-in endpoint', async () => {
    const row = {
      entry_date: '2024-06-15',
      weight: 80,
    } as unknown as CheckInMeasurementRange;
    mockApiFetch.mockResolvedValue([row]);

    const result = await fetchMeasurements('2024-06-15');

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint:
          '/api/measurements/check-in-measurements-range/2024-06-15/2024-06-15',
      })
    );
    expect(result).toBe(row);
  });

  test('returns an empty object when the day has no recorded measurements', async () => {
    mockApiFetch.mockResolvedValue([]);

    await expect(fetchMeasurements('2024-06-15')).resolves.toEqual({});
  });
});

// The probe caches its last successful answer in module state, so these tests
// are order-dependent by design: the virgin-cache case must run first.
describe('serverSupportsPerRecordWater', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('assumes support when the very first probe fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'));

    await expect(serverSupportsPerRecordWater()).resolves.toBe(true);
  });

  test('treats a day-totals response without manual_ml as an older server', async () => {
    mockApiFetch.mockResolvedValue({ water_ml: 1500 });

    await expect(serverSupportsPerRecordWater()).resolves.toBe(false);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: expect.stringMatching(
          /^\/api\/measurements\/water-intake\/\d{4}-\d{2}-\d{2}$/
        ),
      })
    );
  });

  test('reuses the last successful answer when the probe request fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'));

    await expect(serverSupportsPerRecordWater()).resolves.toBe(false);
  });

  test('detects support from the manual_ml breakdown', async () => {
    mockApiFetch.mockResolvedValue({ water_ml: 1500, manual_ml: 500 });

    await expect(serverSupportsPerRecordWater()).resolves.toBe(true);
  });
});

describe('fetchWaterIntakeRange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockResolvedValue([]);
  });

  test('requests the range endpoint with both dates in the path', async () => {
    await fetchWaterIntakeRange('2026-08-01', '2026-08-30');

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/measurements/water-intake-range/2026-08-01/2026-08-30',
      })
    );
  });

  test('returns the response unchanged', async () => {
    const response = [
      { entry_date: '2026-08-01', water_ml: 1500 },
      { entry_date: '2026-08-03', water_ml: 750 },
    ];
    mockApiFetch.mockResolvedValue(response);

    await expect(
      fetchWaterIntakeRange('2026-08-01', '2026-08-30')
    ).resolves.toEqual(response);
  });
});

describe('fetchLatestCheckInMeasurementsOnOrBefore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requests the carry-forward lookup for the given day', async () => {
    mockApiFetch.mockResolvedValue({ weight: 80 });

    await expect(
      fetchLatestCheckInMeasurementsOnOrBefore('2026-05-10')
    ).resolves.toEqual({ weight: 80 });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint:
          '/api/measurements/check-in/latest-on-or-before-date?date=2026-05-10',
      })
    );
  });

  test('encodes the day so a malformed value cannot break the URL', async () => {
    mockApiFetch.mockResolvedValue({});

    await fetchLatestCheckInMeasurementsOnOrBefore('2026-05-10?x=1');

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint:
          '/api/measurements/check-in/latest-on-or-before-date?date=2026-05-10%3Fx%3D1',
      })
    );
  });

  test('normalises the empty-object response to null', async () => {
    mockApiFetch.mockResolvedValue({});
    await expect(
      fetchLatestCheckInMeasurementsOnOrBefore('2026-05-10')
    ).resolves.toBeNull();
  });

  test('normalises a null response to null', async () => {
    mockApiFetch.mockResolvedValue(null);
    await expect(
      fetchLatestCheckInMeasurementsOnOrBefore('2026-05-10')
    ).resolves.toBeNull();
  });
});

describe('fetchLatestManualCustomEntriesOnOrBefore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requests one bulk lookup for every category', async () => {
    const response = [
      {
        id: 'e1',
        category_id: 'cat-1',
        value: '5',
        entry_date: '2026-05-04',
        source: 'manual',
      },
    ];
    mockApiFetch.mockResolvedValue(response);

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2026-05-10')
    ).resolves.toEqual(response);

    // One request, not one per category.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint:
          '/api/measurements/custom-entries/latest-manual-on-or-before-date?date=2026-05-10',
      })
    );
  });
});

describe('fetchLatestManualCustomEntriesOnOrBefore — older-server fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const listResponse = [
    {
      id: 'e1',
      category_id: 'cat-1',
      value: '5',
      entry_date: '2024-06-01',
      entry_hour: null,
      entry_timestamp: '2024-06-01T00:00:00.000Z',
      source: 'manual',
    },
    {
      id: 'e2',
      category_id: 'cat-1',
      value: '9',
      entry_date: '2024-06-10',
      entry_hour: null,
      entry_timestamp: '2024-06-10T00:00:00.000Z',
      source: 'manual',
    },
    {
      id: 'e3',
      category_id: 'cat-2',
      value: '3',
      entry_date: '2024-06-02',
      entry_hour: null,
      entry_timestamp: '2024-06-02T00:00:00.000Z',
      source: 'HealthConnect',
    },
  ];

  test('falls back to the list endpoint when the bulk endpoint fails', async () => {
    // An older server matches the literal path with /custom-entries/:date and
    // fails inside Postgres, so the client sees a 500 rather than a 404.
    mockApiFetch.mockImplementation((options: unknown) => {
      const { endpoint } = options as { endpoint: string };
      if (endpoint.includes('latest-manual-on-or-before-date')) {
        return Promise.reject(
          new ApiError('Server error: 500 - invalid input syntax', 500)
        );
      }
      return Promise.resolve(listResponse);
    });

    const result = await fetchLatestManualCustomEntriesOnOrBefore('2024-06-15');

    // cat-1 resolves to its newest manual entry; the synced cat-2 is omitted.
    expect(result).toEqual([
      {
        id: 'e2',
        category_id: 'cat-1',
        value: '9',
        entry_date: '2024-06-10',
        source: 'manual',
      },
    ]);
  });

  test('the fallback requests the list once, never per category', async () => {
    mockApiFetch.mockImplementation((options: unknown) => {
      const { endpoint } = options as { endpoint: string };
      if (endpoint.includes('latest-manual-on-or-before-date')) {
        return Promise.reject(new ApiError('Server error: 500', 500));
      }
      return Promise.resolve(listResponse);
    });

    await fetchLatestManualCustomEntriesOnOrBefore('2024-06-15');

    const listCalls = mockApiFetch.mock.calls.filter((call) =>
      (call[0] as { endpoint: string }).endpoint.startsWith(
        '/api/measurements/custom-entries?'
      )
    );
    expect(listCalls).toHaveLength(1);
  });

  test('does not fall back when the bulk endpoint succeeds', async () => {
    const bulk = [
      {
        id: 'b1',
        category_id: 'cat-1',
        value: '7',
        entry_date: '2024-06-12',
        source: 'manual',
      },
    ];
    mockApiFetch.mockResolvedValue(bulk);

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2024-06-15')
    ).resolves.toEqual(bulk);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  test('reports the original failure when both paths fail', async () => {
    // The two requests must fail differently, or the assertion would pass
    // whichever error propagated and would not prove the bulk one is preserved.
    mockApiFetch.mockImplementation((options: unknown) => {
      const { endpoint } = options as { endpoint: string };
      return Promise.reject(
        endpoint.includes('latest-manual-on-or-before-date')
          ? new ApiError('Server error: 500 - bulk', 500)
          : new ApiError('Server error: 503 - fallback', 503)
      );
    });

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2024-06-15')
    ).rejects.toThrow('Server error: 500 - bulk');
  });
});

describe('fetchLatestManualCustomEntriesOnOrBefore — fallback scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const listCallCount = () =>
    mockApiFetch.mock.calls.filter((call) =>
      (call[0] as { endpoint: string }).endpoint.startsWith(
        '/api/measurements/custom-entries?'
      )
    ).length;

  test('a 401 does not trigger the compatibility request', async () => {
    // `apiFetch` already called notifySessionExpired for this 401. Retrying
    // would fire it a second time, so the user gets two session-expired
    // prompts from one expired session.
    mockApiFetch.mockRejectedValue(
      new ApiError('Server error: 401 - Unauthorized', 401)
    );

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2024-06-15')
    ).rejects.toThrow('401');
    expect(listCallCount()).toBe(0);
  });

  test('a network failure does not trigger the compatibility request', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network request failed'));

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2024-06-15')
    ).rejects.toThrow('Network request failed');
    expect(listCallCount()).toBe(0);
  });

  test('a 403 does not trigger the compatibility request', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError('Server error: 403 - Forbidden', 403)
    );

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2024-06-15')
    ).rejects.toThrow('403');
    expect(listCallCount()).toBe(0);
  });

  test('a 404 triggers the compatibility request', async () => {
    // The endpoint is absent on a server that predates it.
    mockApiFetch.mockImplementation((options: unknown) => {
      const { endpoint } = options as { endpoint: string };
      if (endpoint.includes('latest-manual-on-or-before-date')) {
        return Promise.reject(new ApiError('Server error: 404', 404));
      }
      return Promise.resolve([]);
    });

    await fetchLatestManualCustomEntriesOnOrBefore('2024-06-15');

    expect(listCallCount()).toBe(1);
  });

  test('a 500 triggers the compatibility request', async () => {
    // The shadowing /custom-entries/:date route fails inside Postgres.
    mockApiFetch.mockImplementation((options: unknown) => {
      const { endpoint } = options as { endpoint: string };
      if (endpoint.includes('latest-manual-on-or-before-date')) {
        return Promise.reject(new ApiError('Server error: 500', 500));
      }
      return Promise.resolve([]);
    });

    await fetchLatestManualCustomEntriesOnOrBefore('2024-06-15');

    expect(listCallCount()).toBe(1);
  });
});

describe('fetchLatestManualCustomEntriesOnOrBefore — truncated legacy history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Reads the page size off the request the client actually made, so these tests
   * stay correct if the constant changes.
   */
  const pageSizeFromRequest = (endpoint: string): number => {
    const match = /limit=(\d+)/.exec(endpoint);
    if (!match) throw new Error(`no limit in endpoint: ${endpoint}`);
    return Number(match[1]);
  };

  /**
   * Answers the bulk request with a 500 (an older server) and the list request
   * with `rows`, simulating a history of the requested page size.
   */
  const respondWithHistory = (
    rows: (index: number) => Record<string, unknown>
  ) => {
    mockApiFetch.mockImplementation((options: unknown) => {
      const { endpoint } = options as { endpoint: string };
      if (endpoint.includes('latest-manual-on-or-before-date')) {
        return Promise.reject(new ApiError('Server error: 500', 500));
      }
      const size = pageSizeFromRequest(endpoint);
      return Promise.resolve(
        Array.from({ length: size }, (_, index) => rows(index))
      );
    });
  };

  const entry = (index: number, entryDate: string, value = '5') => ({
    id: `e${index}`,
    category_id: 'cat-1',
    value,
    entry_date: entryDate,
    entry_hour: null,
    entry_timestamp: `${entryDate}T00:00:00.000Z`,
    source: 'manual',
  });

  test('a full page is refused instead of returning older values as the latest', async () => {
    // THE regression: with more post-date rows than one page, the newest manual
    // value on or before the selected day is never fetched. Returning the
    // truncated tail would offer a value older than the real last one, and the
    // user would adopt it believing it was the latest.
    // The helper builds exactly one full page, so the throw below proves the
    // truncation guard fired rather than the reduction returning [].
    respondWithHistory((index) =>
      // Every row is AFTER the selected day, so nothing on or before it is in
      // the page — exactly the case that used to produce a wrong/empty hint.
      entry(index, '2024-07-01')
    );

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2024-06-15')
    ).rejects.toThrow(/history exceeds/);
  });

  test('a full page does not silently return the pre-date subset', async () => {
    // Mixed page: some rows do qualify, which is what made the old behaviour
    // look plausible while still being unverifiable.
    respondWithHistory((index) =>
      entry(index, index % 2 === 0 ? '2024-06-01' : '2024-07-01')
    );

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2024-06-15')
    ).rejects.toThrow(/history exceeds/);
  });

  test('a short page is trusted and reduced normally', async () => {
    // Fewer rows than the page size proves the history was returned whole.
    mockApiFetch.mockImplementation((options: unknown) => {
      const { endpoint } = options as { endpoint: string };
      if (endpoint.includes('latest-manual-on-or-before-date')) {
        return Promise.reject(new ApiError('Server error: 500', 500));
      }
      return Promise.resolve([
        {
          id: 'old',
          category_id: 'cat-1',
          value: '5',
          entry_date: '2024-06-01',
          entry_hour: null,
          entry_timestamp: '2024-06-01T00:00:00.000Z',
          source: 'manual',
        },
        {
          id: 'new',
          category_id: 'cat-1',
          value: '9',
          entry_date: '2024-06-10',
          entry_hour: null,
          entry_timestamp: '2024-06-10T00:00:00.000Z',
          source: 'manual',
        },
      ]);
    });

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2024-06-15')
    ).resolves.toEqual([
      {
        id: 'new',
        category_id: 'cat-1',
        value: '9',
        entry_date: '2024-06-10',
        source: 'manual',
      },
    ]);
  });

  test('asks for exactly one page, never one request per category', async () => {
    respondWithHistory((index) => entry(index, '2024-07-01'));

    await expect(
      fetchLatestManualCustomEntriesOnOrBefore('2024-06-15')
    ).rejects.toThrow(/history exceeds/);

    const listCalls = mockApiFetch.mock.calls.filter((call) =>
      (call[0] as { endpoint: string }).endpoint.startsWith(
        '/api/measurements/custom-entries?'
      )
    );
    expect(listCalls).toHaveLength(1);
  });
});
