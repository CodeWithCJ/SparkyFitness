import { useCallback, useMemo, useState } from 'react';
import {
  DayWindow,
  isDetailedWindow,
  windowDayCount,
} from '@/utils/heartRateWindow';

export const useHeartRateWindow = (startDate: string, endDate: string) => {
  // Whole report range, and the day window the brush is showing inside it
  const range = useMemo<DayWindow>(() => {
    // Reports always passes both dates; the epoch only keeps the maths valid
    const fallback = '1970-01-01';
    return {
      start: startDate || endDate || fallback,
      end: endDate || startDate || fallback,
    };
  }, [startDate, endDate]);
  const [windowState, setWindowState] = useState<{
    rangeKey: string;
    window: DayWindow;
  } | null>(null);
  // A new report range resets the window to the full range
  const rangeKey = `${range.start}|${range.end}`;
  const dayWindow: DayWindow =
    windowState?.rangeKey === rangeKey ? windowState.window : range;
  const setDayWindow = useCallback(
    (next: DayWindow) => setWindowState({ rangeKey, window: next }),
    [rangeKey]
  );

  const totalDays = windowDayCount(range);
  const zoomDays = windowDayCount(dayWindow);
  const isSingleDay = zoomDays === 1;
  const isDetailed = isDetailedWindow(dayWindow);

  // The 24-hour view shows the last day of the window
  const focusedDate = dayWindow.end;

  return {
    range,
    dayWindow,
    setDayWindow,
    totalDays,
    zoomDays,
    isSingleDay,
    isDetailed,
    focusedDate,
  };
};

export type HeartRateWindow = ReturnType<typeof useHeartRateWindow>;
