import { apiCall } from '@/api/api';
import { compareQueryFor, getCompare } from '@/api/Reports/compareApi';
import { reportKeys } from '@/api/keys/reports';
import { addDays, compareWindow } from '@workspace/shared';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));

const mockedApiCall = apiCall as jest.MockedFunction<typeof apiCall>;

const response = {
  a: { key: 'timeAsleep', values: { '2026-10-20': 400 } },
  b: { key: 'mood', values: { '2026-10-20': 60 } },
  deviations: { a: { '2026-10-20': 5 }, b: { '2026-10-20': -2 } },
  through: '2026-10-21',
  result: { status: 'not_enough', n: 1, needed: 14, reason: 'tooFew' },
  // checks is required by the schema
};

const valid = {
  ...response,
  result: { ...response.result, checks: { ownNormal: true } },
};

const query = {
  a: 'timeAsleep',
  b: 'mood',
  mode: 'day',
  timing: 1,
  start: '2026-07-24',
  end: '2026-10-21',
} as const;

describe('getCompare', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a quiet request asks apiCall not to toast its errors', async () => {
    mockedApiCall.mockResolvedValue(valid);
    await getCompare(query, { quiet: true });
    expect(mockedApiCall).toHaveBeenCalledWith(
      '/v2/reports/compare',
      expect.objectContaining({ suppressErrorToast: true })
    );
  });

  it('sends every field as a query param and returns the parsed response', async () => {
    mockedApiCall.mockResolvedValue(valid);
    const out = await getCompare(query);
    expect(mockedApiCall).toHaveBeenCalledWith('/v2/reports/compare', {
      method: 'GET',
      params: {
        a: 'timeAsleep',
        b: 'mood',
        mode: 'day',
        timing: 1,
        start: '2026-07-24',
        end: '2026-10-21',
      },
    });
    expect(out.through).toBe('2026-10-21');
  });

  it('rejects a response that does not match the schema', async () => {
    mockedApiCall.mockResolvedValue({ nope: true });
    await expect(getCompare(query)).rejects.toThrow();
  });
});

describe('compareQueryFor', () => {
  const window = { startDate: '2026-07-24', endDate: '2026-10-21' };

  it('returns null for an unaskable week question', () => {
    expect(
      compareQueryFor(
        { a: 'meditationSessions7d', b: 'mood', choice: 'sameWeek' },
        window
      )
    ).toBeNull();
  });

  it('returns null for a since question or an incomplete one', () => {
    expect(
      compareQueryFor(
        { a: 'caffeine', b: 'mood', choice: 'sinceHabit' },
        window
      )
    ).toBeNull();
    expect(compareQueryFor({ a: 'caffeine' }, window)).toBeNull();
  });

  it('maps nextDay to timing 1 and keeps the window', () => {
    expect(
      compareQueryFor({ a: 'timeAsleep', b: 'mood', choice: 'nextDay' }, window)
    ).toEqual(query);
  });
});

describe('reportKeys.compare', () => {
  it('spreads the query into the key with the user last', () => {
    expect(reportKeys.compare(query, 'u1')).toEqual([
      'reports',
      'compare',
      'timeAsleep',
      'mood',
      'day',
      1,
      '2026-07-24',
      '2026-10-21',
      { userId: 'u1' },
    ]);
  });
});

describe('compareWindow', () => {
  it('clamps a 200-day custom range to 180 days ending on the chosen end', () => {
    const end = '2026-10-21';
    const out = compareWindow('custom', 'day', '2026-10-22', {
      startDate: addDays(end, -199),
      endDate: end,
    });
    expect(out).toEqual({ startDate: addDays(end, -179), endDate: end });
  });
});
