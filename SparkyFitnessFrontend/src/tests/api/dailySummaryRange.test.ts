import { loadDailySummaryRange } from '@/api/Diary/dailySummaryService';
import { apiCall } from '@/api/api';
import type { DailyCalorieBalanceRow } from '@workspace/shared';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

const mockApiCall = jest.mocked(apiCall);

/** Parses the `startDate`/`endDate` back out of each recorded request. */
const requestedWindows = () =>
  mockApiCall.mock.calls.map(([endpoint]) => {
    const params = new URLSearchParams(String(endpoint).split('?')[1]);
    return [params.get('startDate'), params.get('endDate')];
  });

const row = (date: string): DailyCalorieBalanceRow => ({
  date,
  eaten: 2000,
  goal: 1800,
  remaining: -200,
  burned: 0,
  net: 2000,
  progress: 0,
  bmr: 1800,
  bmrSource: 'formula',
  exerciseSource: 'none',
  tdeeProjection: null,
  stepCalories: 0,
});

beforeEach(() => {
  mockApiCall.mockReset();
  mockApiCall.mockResolvedValue({ days: [] });
});

describe('loadDailySummaryRange', () => {
  it('sends a window at or under the cap as a single request', async () => {
    await loadDailySummaryRange('2026-01-01', '2026-03-01');

    expect(requestedWindows()).toEqual([['2026-01-01', '2026-03-01']]);
  });

  it('sends exactly one request for a window of precisely the cap', async () => {
    // 2026-01-01 + 365 days = 2027-01-01, i.e. 366 days inclusive.
    await loadDailySummaryRange('2026-01-01', '2027-01-01');

    expect(requestedWindows()).toEqual([['2026-01-01', '2027-01-01']]);
  });

  /**
   * Reports reads its dates from URL params, so a hand-edited or bookmarked link can ask
   * for more than the server's 366-day cap. That used to 400, leaving the charts on their
   * bare-stored-goal fallback -- which renders as exactly the #2094 mismatch.
   */
  it('splits a longer window into contiguous, non-overlapping requests', async () => {
    await loadDailySummaryRange('2026-01-01', '2027-06-30');

    expect(requestedWindows()).toEqual([
      ['2026-01-01', '2027-01-01'],
      ['2027-01-02', '2027-06-30'],
    ]);
  });

  it('concatenates the chunks in order', async () => {
    mockApiCall
      .mockResolvedValueOnce({ days: [row('2026-01-01')] })
      .mockResolvedValueOnce({ days: [row('2027-01-02')] });

    const result = await loadDailySummaryRange('2026-01-01', '2027-06-30');

    expect(result.days.map((day) => day.date)).toEqual([
      '2026-01-01',
      '2027-01-02',
    ]);
  });

  it('forwards the family-access userId on every chunk', async () => {
    await loadDailySummaryRange('2026-01-01', '2027-06-30', 'user-9');

    expect(mockApiCall).toHaveBeenCalledTimes(2);
    for (const [endpoint] of mockApiCall.mock.calls) {
      expect(String(endpoint)).toContain('userId=user-9');
    }
  });

  it('returns no days for an inverted range instead of calling the server', async () => {
    const result = await loadDailySummaryRange('2026-03-01', '2026-01-01');

    expect(result).toEqual({ days: [] });
    expect(mockApiCall).not.toHaveBeenCalled();
  });
});
