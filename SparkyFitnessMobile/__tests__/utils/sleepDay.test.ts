import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  formatClockTime,
  formatSleepDuration,
  resolveSleepZone,
} from '../../src/utils/sleepDay';
import { buildSleepEntry } from '../helpers/sleepFixtures';

/**
 * Builds an ISO instant whose *local* wall-clock time is known, so clock-formatting
 * assertions hold in any runner timezone. `formatClockTime` renders in local time, so
 * pinning UTC directly would make these tests pass only in UTC.
 */
const localInstant = (hour: number, minute: number): string =>
  new Date(2026, 7, 23, hour, minute, 0).toISOString();

describe('formatSleepDuration', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  test('renders hours and minutes', () => {
    expect(formatSleepDuration(27000, i18n.t)).toBe('7h 30m');
  });

  test('renders a bare 0m for zero, not 0h 0m', () => {
    expect(formatSleepDuration(0, i18n.t)).toBe('0m');
  });

  test('renders a placeholder for null rather than "null" or "NaN"', () => {
    const formatted = formatSleepDuration(null, i18n.t);

    expect(formatted).not.toContain('null');
    expect(formatted).not.toContain('NaN');
    expect(formatted).toBe('—');
  });

  test('floors a sub-minute span to 0m', () => {
    const formatted = formatSleepDuration(45, i18n.t);

    expect(formatted).toBe('0m');
    expect(formatted).not.toContain('NaN');
    expect(formatted).not.toContain('-');
  });

  test('reports spans over a day in full instead of wrapping modulo 24', () => {
    expect(formatSleepDuration(90000, i18n.t)).toBe('25h 0m');
  });

  test('takes its copy from the injected translator, not the singleton', async () => {
    const english = formatSleepDuration(27000, i18n.t);

    await i18n.changeLanguage('pl');
    const polish = formatSleepDuration(27000, i18n.t);

    expect(english).toBe('7h 30m');
    expect(polish).not.toBe(english);
    expect(polish).toBe('7godz. 30min');
  });
});

describe('formatClockTime', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  test("renders 24-hour time under the account's 'HH:mm' preference", () => {
    // The regression: en-US defaults to 12-hour, so this only passes if the account
    // setting wins over the locale convention.
    expect(formatClockTime(localInstant(15, 38), 'HH:mm')).toBe('15:38');
  });

  test("renders 12-hour time under the account's 'h:mm A' preference", () => {
    expect(formatClockTime(localInstant(15, 38), 'h:mm A')).toBe('3:38 PM');
    expect(formatClockTime(localInstant(9, 5), 'h:mm a')).toBe('9:05 AM');
  });

  test('the account preference overrides the locale default in both directions', async () => {
    // en-US is a 12-hour locale, pl-PL a 24-hour one; the setting beats both.
    expect(formatClockTime(localInstant(15, 38), 'HH:mm')).toBe('15:38');

    await i18n.changeLanguage('pl');
    expect(formatClockTime(localInstant(15, 38), 'h:mm A')).toBe('3:38 PM');
  });

  test('falls back to the locale convention when no preference is set', async () => {
    expect(formatClockTime(localInstant(15, 38), undefined)).toBe('3:38 PM');

    await i18n.changeLanguage('pl');
    expect(formatClockTime(localInstant(15, 38), undefined)).toBe('15:38');
  });

  test('renders a placeholder for unparseable or empty input', () => {
    for (const input of ['', 'not-a-date', null, undefined]) {
      const formatted = formatClockTime(input, 'HH:mm');
      expect(formatted).toBe('—');
      expect(formatted).not.toContain('Invalid Date');
    }
  });

  describe('record zones', () => {
    // 22:45 UTC is 07:45 the next morning in Tokyo and 17:45 the same evening at UTC-5,
    // so neither reading can be produced by the runner's own clock by coincidence.
    const instant = '2026-08-22T22:45:00+00:00';

    test('renders the wall clock of the zone the session was recorded in', () => {
      expect(
        formatClockTime(instant, 'HH:mm', { kind: 'tz', tz: 'Asia/Tokyo' })
      ).toBe('07:45');
      expect(formatClockTime(instant, 'HH:mm', { kind: 'tz', tz: 'UTC' })).toBe(
        '22:45'
      );
    });

    test('renders against a fixed UTC offset for sources that only report one', () => {
      expect(
        formatClockTime(instant, 'HH:mm', { kind: 'offset', minutes: -300 })
      ).toBe('17:45');
      expect(
        formatClockTime(instant, 'HH:mm', { kind: 'offset', minutes: 330 })
      ).toBe('04:15');
    });

    test('still honours the account time format inside a zone', () => {
      expect(
        formatClockTime(instant, 'h:mm A', { kind: 'tz', tz: 'Asia/Tokyo' })
      ).toBe('7:45 AM');
    });

    test('falls back to the device clock when no zone is known', () => {
      const deviceClock = new Date(instant);
      const expected = `${String(deviceClock.getHours()).padStart(2, '0')}:${String(
        deviceClock.getMinutes()
      ).padStart(2, '0')}`;

      expect(formatClockTime(instant, 'HH:mm', null)).toBe(expected);
      expect(formatClockTime(instant, 'HH:mm')).toBe(expected);
    });
  });
});

describe('resolveSleepZone', () => {
  test('prefers the recorded timezone over everything else', () => {
    const entry = buildSleepEntry({
      record_timezone: 'Asia/Tokyo',
      record_utc_offset_minutes: -300,
    });

    expect(resolveSleepZone(entry, 'Europe/Berlin')).toEqual({
      kind: 'tz',
      tz: 'Asia/Tokyo',
    });
  });

  test('falls back to the recorded offset when no timezone was captured', () => {
    const entry = buildSleepEntry({ record_utc_offset_minutes: -300 });

    expect(resolveSleepZone(entry, 'Europe/Berlin')).toEqual({
      kind: 'offset',
      minutes: -300,
    });
  });

  test('falls back to the profile timezone when the record carries neither', () => {
    expect(resolveSleepZone(buildSleepEntry(), 'Europe/Berlin')).toEqual({
      kind: 'tz',
      tz: 'Europe/Berlin',
    });
  });

  test('rejects an unusable recorded timezone rather than passing it to Intl', () => {
    const entry = buildSleepEntry({ record_timezone: 'Not/AZone' });

    expect(resolveSleepZone(entry, 'Europe/Berlin')).toEqual({
      kind: 'tz',
      tz: 'Europe/Berlin',
    });
  });

  test('returns null when nothing recorded where the user was', () => {
    for (const profileTimezone of [null, undefined, '', 'Not/AZone']) {
      expect(resolveSleepZone(buildSleepEntry(), profileTimezone)).toBeNull();
    }
  });
});
