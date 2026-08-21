import { apiCall } from '../api';
import { addDays, compareDays } from '@workspace/shared';
import type {
  DailyCalorieBalanceRow,
  DailySummaryRangeResponse,
  DailySummaryResponse,
} from '@workspace/shared';

export const loadDailySummary = (date: string): Promise<DailySummaryResponse> =>
  apiCall(`/daily-summary?date=${encodeURIComponent(date)}`, {
    method: 'GET',
  });

/**
 * Largest window `GET /daily-summary/range` accepts in one request.
 *
 * Must stay in step with `MAX_RANGE_DAYS` in `routes/dailySummaryRoutes.ts`. The server
 * caps the span to bound its per-day goal loop; this constant exists so the browser
 * splits a longer report into requests the server will answer, rather than sending one
 * it will reject.
 */
const MAX_RANGE_DAYS = 366;

const fetchWindow = (
  startDate: string,
  endDate: string,
  userId?: string
): Promise<DailySummaryRangeResponse> => {
  const params = new URLSearchParams({ startDate, endDate });
  if (userId) params.set('userId', userId);
  return apiCall(`/daily-summary/range?${params.toString()}`, {
    method: 'GET',
  });
};

/**
 * Per-day calorie balance for a date range, computed server-side by the same code path
 * as `loadDailySummary`.
 *
 * Reports uses this instead of deriving the balance from raw exercise entries in the
 * browser. That derivation was issue #2094: it summed the device "Active Calories" row
 * on top of logged workouts, never saw step calories, and ignored the
 * "Include BMR in Net Calories" preference.
 *
 * Windows longer than the server's cap are split and re-joined here. Reports reads its
 * dates from URL params, so a hand-edited or bookmarked link can ask for more than 366
 * days; that used to 400 and leave the charts falling back to the bare stored goal —
 * which renders as the *exact* mismatch #2094 reported, only now with no bug behind it.
 * Failing loudly would be better than that, but answering correctly is better still.
 *
 * Chunks are sequential rather than parallel: a multi-year report would otherwise fire
 * a dozen concurrent requests, each running the full per-day goal loop.
 */
export const loadDailySummaryRange = async (
  startDate: string,
  endDate: string,
  userId?: string
): Promise<DailySummaryRangeResponse> => {
  // An inverted range has no days in it. Returning empty matches what the day loop
  // below would produce and keeps callers on the "no balance for this date" path.
  if (compareDays(startDate, endDate) > 0) return { days: [] };

  const days: DailyCalorieBalanceRow[] = [];
  let windowStart = startDate;

  while (compareDays(windowStart, endDate) <= 0) {
    const windowLast = addDays(windowStart, MAX_RANGE_DAYS - 1);
    const windowEnd =
      compareDays(windowLast, endDate) < 0 ? windowLast : endDate;

    const chunk = await fetchWindow(windowStart, windowEnd, userId);
    days.push(...chunk.days);

    windowStart = addDays(windowEnd, 1);
  }

  return { days };
};
