import {
  fetchCompare,
  fetchCompareSince,
} from '../../src/services/api/compareApi';

const mockApiFetch = jest.fn();
jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const okResponse = {
  a: { key: 'timeAsleep', values: { '2026-10-01': 420 } },
  b: { key: 'energy', values: { '2026-10-01': 3 } },
  through: '2026-10-21',
  deviations: { a: { '2026-10-01': 1 }, b: { '2026-10-01': 0.5 } },
  result: {
    status: 'not_enough',
    n: 1,
    needed: 14,
    reason: 'tooFew',
    checks: { ownNormal: true },
  },
};

const params = {
  a: 'timeAsleep',
  b: 'energy',
  mode: 'day',
  timing: 0,
  start: '2026-07-24',
  end: '2026-10-21',
} as const;

describe('fetchCompare', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GETs the compare endpoint with every parameter encoded', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse);
    await fetchCompare(params);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint:
          '/api/v2/reports/compare?a=timeAsleep&b=energy&mode=day&timing=0&start=2026-07-24&end=2026-10-21',
      })
    );
  });

  it('encodes a negative timing', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse);
    await fetchCompare({ ...params, timing: -1 });
    expect(mockApiFetch.mock.calls[0][0].endpoint).toContain('timing=-1');
  });

  it('returns the parsed response', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse);
    await expect(fetchCompare(params)).resolves.toEqual(okResponse);
  });

  it('rejects a response missing result', async () => {
    const { result: _result, ...noResult } = okResponse;
    mockApiFetch.mockResolvedValueOnce(noResult);
    await expect(fetchCompare(params)).rejects.toThrow();
  });
});

const sinceResponse = {
  mode: 'since',
  habit: { key: 'meditated', values: { '2026-09-01': 1 } },
  outcome: { key: 'mood', values: { '2026-09-01': 70 } },
  result: {
    status: 'not_enough',
    reason: 'fewSince',
    start: '2026-09-01',
    suggestedStart: '2026-09-01',
    before: { from: '2026-08-01', to: '2026-08-31', days: 31, valueDays: 20 },
    since: { from: '2026-09-01', to: '2026-10-20', days: 50, valueDays: 9 },
    line: 70,
  },
};

const sinceParams = {
  a: 'meditated',
  b: 'mood',
  habitStart: null,
  line: null,
} as const;

describe('fetchCompareSince', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for the suggested start and default line when none is picked', async () => {
    mockApiFetch.mockResolvedValueOnce(sinceResponse);
    await fetchCompareSince(sinceParams);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/reports/compare?a=meditated&b=mood&mode=since',
      })
    );
  });

  it('sends the picked start and line', async () => {
    mockApiFetch.mockResolvedValueOnce(sinceResponse);
    await fetchCompareSince({
      ...sinceParams,
      habitStart: '2026-06-15',
      line: 65,
    });
    expect(mockApiFetch.mock.calls[0][0].endpoint).toBe(
      '/api/v2/reports/compare?a=meditated&b=mood&mode=since&habitStart=2026-06-15&line=65'
    );
  });

  it('sends a line of 0', async () => {
    mockApiFetch.mockResolvedValueOnce(sinceResponse);
    await fetchCompareSince({ ...sinceParams, line: 0 });
    expect(mockApiFetch.mock.calls[0][0].endpoint).toContain('&line=0');
  });

  it('returns the parsed response', async () => {
    mockApiFetch.mockResolvedValueOnce(sinceResponse);
    await expect(fetchCompareSince(sinceParams)).resolves.toEqual(
      sinceResponse
    );
  });

  it('rejects a day-mode response', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse);
    await expect(fetchCompareSince(sinceParams)).rejects.toThrow();
  });
});
