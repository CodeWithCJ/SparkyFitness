import i18n, { initializeI18n } from '../../src/localization/i18n';
import { formatClockTime, formatSleepDuration } from '../../src/utils/sleepDay';

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
});
