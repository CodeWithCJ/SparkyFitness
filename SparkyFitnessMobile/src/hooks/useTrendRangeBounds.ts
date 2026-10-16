import { useCallback, useRef, useState } from 'react';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { getTodayDate } from '../utils/dateUtils';
import {
  clampCustomRange,
  trendRangeBounds,
  type CustomRange,
  type ReportRange,
} from '../utils/trendRange';

/**
 * Date bounds for a range ending today (or the days the user picked), refreshed on screen focus.
 *
 * Today is held in state so a screen left open past midnight moves its range
 * forward on the next focus; the new bounds change the caller's query key,
 * which fetches on its own. On the same day, `refresh` runs instead, because
 * default staleTime is Infinity and a workout logged elsewhere should show.
 *
 * The first focus is the screen opening, when the caller's queries are
 * already fetching for the day just read, so it is skipped rather than
 * invalidating (or, for cardio, resetting) a request in flight.
 */
export function useTrendRangeBounds(
  range: ReportRange,
  refresh: () => void,
  custom?: CustomRange | null
) {
  const [today, setToday] = useState(getTodayDate);
  const focusedBefore = useRef(false);

  const onFocus = useCallback(() => {
    if (!focusedBefore.current) {
      focusedBefore.current = true;
      return;
    }
    const now = getTodayDate();
    if (now !== today) {
      setToday(now);
      return;
    }
    refresh();
  }, [today, refresh]);
  useRefetchOnFocus(onFocus);

  // Picked days are fixed, so they only need the clamp (nothing after today).
  if (range === 'custom' && custom) {
    return clampCustomRange(custom.startDate, custom.endDate, today);
  }
  return trendRangeBounds(range === 'custom' ? '30d' : range, today);
}
