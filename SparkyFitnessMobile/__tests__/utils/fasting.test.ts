import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  formatElapsedClock,
  formatHoursMinutes,
  computeFastTimerValues,
  formatFastingStats,
  formatLastFast,
  formatTime,
  formatDateTime,
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
    expect(formatElapsedClock(0)).toBe('00:00:00');
    expect(formatElapsedClock(3723 * 1000)).toBe('01:02:03');
  });

  test('does not cap hours at 24', () => {
    expect(formatElapsedClock(25 * HOUR)).toBe('25:00:00');
  });

  test('clamps negative input to zero', () => {
    expect(formatElapsedClock(-5000)).toBe('00:00:00');
  });
});

describe('formatHoursMinutes', () => {
  test('drops the hours when zero', () => {
    expect(formatHoursMinutes(0, i18n.t)).toBe('0m');
    expect(formatHoursMinutes(47 * 60 * 1000, i18n.t)).toBe('47m');
  });

  test('renders hours and minutes', () => {
    expect(formatHoursMinutes(107 * 60 * 1000, i18n.t)).toBe('1h 47m');
    expect(formatHoursMinutes(964 * 60 * 1000, i18n.t)).toBe('16h 4m');
  });

  test('uses the supplied translator for localized duration labels', () => {
    const pl = ((key: string, options: { defaultValue: string; minutes?: number; hours?: number }) => {
      if (key === 'fastingCard.duration.minutes') return `${options.minutes ?? 0} min`;
      return `${options.hours ?? 0} godz. ${options.minutes ?? 0} min`;
    }) as never;

    expect(formatHoursMinutes(47 * 60 * 1000, pl)).toBe('47 min');
    expect(formatHoursMinutes(107 * 60 * 1000, pl)).toBe('1 godz. 47 min');
  });

  test('clamps negative input to zero', () => {
    expect(formatHoursMinutes(-1000, i18n.t)).toBe('0m');
  });
});

describe('computeFastTimerValues', () => {
  test('derives progress and remaining from the timestamps', () => {
    const start = '1970-01-01T00:00:00.000Z';
    const target = new Date(16 * HOUR).toISOString();
    // 14:12:38 elapsed
    const now = (14 * 3600 + 12 * 60 + 38) * 1000;

    const pl = ((key: string, options: { defaultValue: string; minutes?: number; hours?: number }) => {
      if (key === 'fastingCard.duration.minutes') return `${options.minutes ?? 0} min`;
      return `${options.hours ?? 0} godz. ${options.minutes ?? 0} min`;
    }) as never;
    const v = computeFastTimerValues(start, target, now, pl);

    expect(v.hasGoal).toBe(true);
    expect(v.goalHours).toBe(16);
    expect(v.hhmmss).toBe('14:12:38');
    expect(Math.round(v.progress * 100)).toBe(89);
    expect(v.remainingLabel).toBe('1 godz. 47 min');
    expect(v.stage.key).toBe('catabolic');
  });

  test('elapsed-only when target is null (no goal, no progress)', () => {
    const start = '1970-01-01T00:00:00.000Z';
    const now = 18 * HOUR;

    const v = computeFastTimerValues(start, null, now, i18n.t);

    expect(v.hasGoal).toBe(false);
    expect(v.goalHours).toBeNull();
    expect(v.remainingMs).toBeNull();
    expect(v.remainingLabel).toBeNull();
    expect(v.progress).toBe(0);
    expect(v.elapsedLabel).toBe('18h 0m');
    expect(v.stage.key).toBe('fat-burning');
  });

  test('treats a target at/before the start as no goal', () => {
    const start = new Date(10 * HOUR).toISOString();
    const target = new Date(5 * HOUR).toISOString();
    const v = computeFastTimerValues(start, target, 11 * HOUR, i18n.t);
    expect(v.hasGoal).toBe(false);
  });

  test('clamps progress to 1 and remaining to 0 past the goal', () => {
    const start = '1970-01-01T00:00:00.000Z';
    const target = new Date(16 * HOUR).toISOString();
    const v = computeFastTimerValues(start, target, 20 * HOUR, i18n.t);
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
    }, i18n.t);
    expect(display.fastsCount).toBe('0');
    expect(display.avgFastValue).toBe('-');
    expect(display.avgFastUnit).toBe('');
    expect(display.totalValue).toBe('-');
    expect(display.totalUnit).toBe('');
  });

  test('handles a fully undefined stats object', () => {
    const display = formatFastingStats(undefined, i18n.t);
    expect(display.fastsCount).toBe('0');
    expect(display.avgFastValue).toBe('-');
    expect(display.totalValue).toBe('-');
  });

  test('formats populated stats with the active locale unit', async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
    const english = formatFastingStats({
      total_completed_fasts: '47',
      total_minutes_fasted: 44520,
      average_duration_minutes: 948,
    }, i18n.t);
    expect(english.fastsCount).toBe('47');
    expect(english.avgFastValue).toBe('15.8');
    expect(english.avgFastUnit).toBe('h');
    expect(english.totalValue).toBe('742');
    expect(english.totalUnit).toBe('h');

    await i18n.changeLanguage('pl');
    const polish = formatFastingStats({
      total_completed_fasts: '47',
      total_minutes_fasted: 44520,
      average_duration_minutes: 948,
    }, i18n.t);
    expect(polish.avgFastUnit).toBe('godz.');
    expect(polish.totalUnit).toBe('godz.');
    // The locale-aware formatter must render a decimal comma in Polish, not
    // the English decimal point, while the numeric value is unchanged.
    expect(polish.avgFastValue).toBe('15,8');
  });

  test('formats populated stats with locale-aware decimal separators', async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
    const english = formatFastingStats({
      total_completed_fasts: '47',
      total_minutes_fasted: 44520,
      average_duration_minutes: 948,
    }, i18n.t);
    expect(english.avgFastValue).toBe('15.8');

    await i18n.changeLanguage('pl');
    const polish = formatFastingStats({
      total_completed_fasts: '47',
      total_minutes_fasted: 44520,
      average_duration_minutes: 948,
    }, i18n.t);
    expect(polish.avgFastValue).toBe('15,8');

    await i18n.changeLanguage('en');
  });
});

describe('formatLastFast', () => {
  test('returns null with no log', () => {
    expect(formatLastFast(undefined, i18n.t)).toBeNull();
    expect(formatLastFast(null, i18n.t)).toBeNull();
  });

  test('returns null when the newest row has a null duration', () => {
    expect(formatLastFast(buildFast({ duration_minutes: null }), i18n.t)).toBeNull();
  });

  test('formats a completed fast that ended yesterday', async () => {
    await i18n.changeLanguage('en');
    const yesterday = new Date(Date.now() - 24 * HOUR).toISOString();
    const result = formatLastFast(
      buildFast({ duration_minutes: 964, end_time: yesterday }),
      i18n.t,
    );
    expect(result).toBe('Last fast 16h 4m · yesterday');
  });

  test('formats a completed fast that ended today', async () => {
    await i18n.changeLanguage('en');
    const now = new Date().toISOString();
    const result = formatLastFast(
      buildFast({ duration_minutes: 120, end_time: now }),
      i18n.t,
    );
    expect(result).toBe('Last fast 2h 0m · today');
  });

  test('uses Polish duration and relative-day copy', async () => {
    const polishT = i18n.getFixedT('pl');
    const now = new Date().toISOString();
    const result = formatLastFast(
      buildFast({ duration_minutes: 120, end_time: now }),
      polishT,
    );
    expect(result).toBe('Ostatni post: 2 godz. 0 min · dzisiaj');
  });
});

describe('formatTime / formatDateTime locale handling', () => {
  const iso = new Date('2026-06-03T15:30:00').toISOString();

  test('follows the active application locale (not the device locale) for time', async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
    const enTime = formatTime(iso);
    // en-US uses 12-hour AM/PM presentation.
    expect(enTime.toLowerCase()).toContain('pm');

    await i18n.changeLanguage('pl');
    const plTime = formatTime(iso);
    // pl-PL uses 24-hour presentation, no AM/PM suffix.
    expect(plTime.toLowerCase()).not.toContain('pm');
    expect(plTime).not.toBe(enTime);

    await i18n.changeLanguage('en');
  });

  test('follows the active application locale for date + time', async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
    const date = new Date('2026-06-03T15:30:00');
    const enDateTime = formatDateTime(date);
    expect(enDateTime.toLowerCase()).toContain('pm');

    await i18n.changeLanguage('pl');
    const plDateTime = formatDateTime(date);
    expect(plDateTime.toLowerCase()).not.toContain('pm');
    expect(plDateTime).not.toBe(enDateTime);

    await i18n.changeLanguage('en');
  });
});
