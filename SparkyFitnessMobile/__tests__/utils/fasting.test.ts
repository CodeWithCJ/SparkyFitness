import {
  formatElapsedClock,
  formatHoursMinutes,
  computeFastTimerValues,
  formatFastingStats,
  formatLastFast,
} from '../../src/utils/fasting';
import type { FastingLog } from '../../src/types/fasting';

const HOUR = 1000 * 60 * 60;

function buildFast(overrides: Partial<FastingLog> = {}): FastingLog {
  return {
    id: 'fast-1',
    user_id: 'user-1',
    start_time: new Date(0).toISOString(),
    end_time: null,
    target_end_time: null,
    duration_minutes: null,
    fasting_type: '16:8 Leangains',
    status: 'COMPLETED',
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('formatElapsedClock', () => {
  test('formats hours/minutes/seconds with zero-padding', () => {
    expect(formatElapsedClock(0)).toBe('٠٠:٠٠:٠٠');
    expect(formatElapsedClock(3723 * 1000)).toBe('٠١:٠٢:٠٣');
  });

  test('does not cap hours at 24', () => {
    expect(formatElapsedClock(25 * HOUR)).toBe('٢٥:٠٠:٠٠');
  });

  test('clamps negative input to zero', () => {
    expect(formatElapsedClock(-5000)).toBe('٠٠:٠٠:٠٠');
  });
});

describe('formatHoursMinutes', () => {
  test('drops the hours when zero', () => {
    expect(formatHoursMinutes(0)).toBe('٠ دقيقة');
    expect(formatHoursMinutes(47 * 60 * 1000)).toBe('٤٧ دقيقة');
  });

  test('renders hours and minutes', () => {
    expect(formatHoursMinutes(107 * 60 * 1000)).toBe('ساعة و٤٧ دقيقة');
    expect(formatHoursMinutes(964 * 60 * 1000)).toBe('١٦ ساعة و٤ دقائق');
  });

  test('clamps negative input to zero', () => {
    expect(formatHoursMinutes(-1000)).toBe('٠ دقيقة');
  });
});

describe('computeFastTimerValues', () => {
  test('derives progress and remaining from the timestamps', () => {
    const start = '1970-01-01T00:00:00.000Z';
    const target = new Date(16 * HOUR).toISOString();
    // 14:12:38 elapsed
    const now = (14 * 3600 + 12 * 60 + 38) * 1000;

    const v = computeFastTimerValues(start, target, now);

    expect(v.hasGoal).toBe(true);
    expect(v.goalHours).toBe(16);
    expect(v.hhmmss).toBe('١٤:١٢:٣٨');
    expect(Math.round(v.progress * 100)).toBe(89);
    expect(v.remainingLabel).toBe('ساعة و٤٧ دقيقة');
    expect(v.stage.key).toBe('catabolic');
  });

  test('elapsed-only when target is null (no goal, no progress)', () => {
    const start = '1970-01-01T00:00:00.000Z';
    const now = 18 * HOUR;

    const v = computeFastTimerValues(start, null, now);

    expect(v.hasGoal).toBe(false);
    expect(v.goalHours).toBeNull();
    expect(v.remainingMs).toBeNull();
    expect(v.remainingLabel).toBeNull();
    expect(v.progress).toBe(0);
    expect(v.elapsedLabel).toBe('١٨ ساعة');
    expect(v.stage.key).toBe('fat-burning');
  });

  test('treats a target at/before the start as no goal', () => {
    const start = new Date(10 * HOUR).toISOString();
    const target = new Date(5 * HOUR).toISOString();
    const v = computeFastTimerValues(start, target, 11 * HOUR);
    expect(v.hasGoal).toBe(false);
  });

  test('clamps progress to 1 and remaining to 0 past the goal', () => {
    const start = '1970-01-01T00:00:00.000Z';
    const target = new Date(16 * HOUR).toISOString();
    const v = computeFastTimerValues(start, target, 20 * HOUR);
    expect(v.progress).toBe(1);
    expect(v.remainingMs).toBe(0);
  });
});

describe('formatFastingStats', () => {
  test('null-safe when there are no completed fasts (SUM/AVG null, count "0")', () => {
    const display = formatFastingStats({
      total_completed_fasts: '0',
      total_minutes_fasted: null,
      average_duration_minutes: null,
    });
    expect(display.fastsCount).toBe('٠');
    expect(display.avgFastValue).toBe('—');
    expect(display.avgFastUnit).toBe('');
    expect(display.totalValue).toBe('—');
    expect(display.totalUnit).toBe('');
  });

  test('handles a fully undefined stats object', () => {
    const display = formatFastingStats(undefined);
    expect(display.fastsCount).toBe('٠');
    expect(display.avgFastValue).toBe('—');
    expect(display.totalValue).toBe('—');
  });

  test('formats populated stats (string count, minutes to hours)', () => {
    const display = formatFastingStats({
      total_completed_fasts: '47',
      total_minutes_fasted: 44520,
      average_duration_minutes: 948,
    });
    expect(display.fastsCount).toBe('٤٧');
    expect(display.avgFastValue).toBe('١٥٫٨');
    expect(display.avgFastUnit).toBe('ساعة');
    expect(display.totalValue).toBe('٧٤٢');
    expect(display.totalUnit).toBe('ساعة');
  });
});

describe('formatLastFast', () => {
  test('returns null with no log', () => {
    expect(formatLastFast(undefined)).toBeNull();
    expect(formatLastFast(null)).toBeNull();
  });

  test('returns null when the newest row has a null duration', () => {
    expect(formatLastFast(buildFast({ duration_minutes: null }))).toBeNull();
  });

  test('formats a completed fast that ended yesterday', () => {
    const yesterday = new Date(Date.now() - 24 * HOUR).toISOString();
    const result = formatLastFast(
      buildFast({ duration_minutes: 964, end_time: yesterday }),
    );
    expect(result).toBe('آخر صيام ١٦ ساعة و٤ دقائق · أمس');
  });

  test('formats a completed fast that ended today', () => {
    const now = new Date().toISOString();
    const result = formatLastFast(
      buildFast({ duration_minutes: 120, end_time: now }),
    );
    expect(result).toBe('آخر صيام ساعتين · اليوم');
  });
});
