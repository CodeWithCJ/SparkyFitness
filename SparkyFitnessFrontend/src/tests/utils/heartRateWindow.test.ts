import {
  dayStringToMs,
  isDetailedWindow,
  lastDaysWindow,
  selectionMsToWindow,
  shiftWindow,
  windowDayCount,
  windowToSelectionMs,
} from '@/utils/heartRateWindow';

const DAY = 24 * 60 * 60 * 1000;
const range = { start: '2026-10-04', end: '2026-10-24' };

describe('heartRateWindow', () => {
  it('counts days inclusively and picks detailed mode up to three days', () => {
    expect(windowDayCount({ start: '2026-10-10', end: '2026-10-10' })).toBe(1);
    expect(windowDayCount({ start: '2026-10-10', end: '2026-10-12' })).toBe(3);
    expect(isDetailedWindow({ start: '2026-10-10', end: '2026-10-12' })).toBe(
      true
    );
    expect(isDetailedWindow({ start: '2026-10-10', end: '2026-10-13' })).toBe(
      false
    );
  });

  it('round-trips a window through brush milliseconds', () => {
    const win = { start: '2026-10-10', end: '2026-10-12' };
    const { startMs, endMs } = windowToSelectionMs(win);
    expect(endMs - startMs).toBe(3 * DAY);
    expect(selectionMsToWindow(startMs, endMs, range)).toEqual(win);
  });

  it('snaps a partial-day drag to whole days', () => {
    const startMs = dayStringToMs('2026-10-15') + 0.4 * DAY;
    const endMs = dayStringToMs('2026-10-18') + 0.2 * DAY;
    expect(selectionMsToWindow(startMs, endMs, range)).toEqual({
      start: '2026-10-15',
      end: '2026-10-17',
    });
  });

  it('keeps at least one day and stays inside the range', () => {
    const at = dayStringToMs('2026-10-15');
    expect(selectionMsToWindow(at, at, range)).toEqual({
      start: '2026-10-15',
      end: '2026-10-15',
    });
    expect(
      selectionMsToWindow(dayStringToMs('2026-09-01'), at + 30 * DAY, range)
    ).toEqual(range);
  });

  it('builds last-N-day presets inside the range', () => {
    expect(lastDaysWindow(range, 3)).toEqual({
      start: '2026-10-22',
      end: '2026-10-24',
    });
    expect(lastDaysWindow(range, 90)).toEqual(range);
  });

  it('pans a window without changing its width or leaving the range', () => {
    const win = { start: '2026-10-10', end: '2026-10-12' };
    expect(shiftWindow(win, 5, range)).toEqual({
      start: '2026-10-15',
      end: '2026-10-17',
    });
    expect(shiftWindow(win, 100, range)).toEqual({
      start: '2026-10-22',
      end: '2026-10-24',
    });
    expect(shiftWindow(win, -100, range)).toEqual({
      start: '2026-10-04',
      end: '2026-10-06',
    });
  });
});
