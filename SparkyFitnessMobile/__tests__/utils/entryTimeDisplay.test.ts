import { initializeI18n } from '../../src/localization/i18n';
import {
  formatDateToTimeLabel,
  formatTimeLabel,
  is12HourTimeFormat,
} from '../../src/utils/entryTimeDisplay';

describe('entry time display respects account time_format', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test("HH:mm (24-hour) renders '15:38' regardless of locale AM/PM default", () => {
    expect(formatTimeLabel('15:38', 'HH:mm')).toBe('15:38');
    expect(formatTimeLabel('09:05:00', 'HH:mm')).toBe('09:05');
  });

  test("h:mm A / h:mm a (12-hour) render '3:38 PM'", () => {
    expect(formatTimeLabel('15:38', 'h:mm A')).toBe('3:38 PM');
    expect(formatTimeLabel('09:05', 'h:mm a')).toBe('9:05 AM');
  });

  test('no preference falls back to the app locale default', async () => {
    // en-US default is 12-hour AM/PM.
    expect(formatTimeLabel('15:38')).toBe('3:38 PM');
  });

  test('null/empty/invalid returns null', () => {
    expect(formatTimeLabel(null, 'HH:mm')).toBeNull();
    expect(formatTimeLabel('', 'HH:mm')).toBeNull();
    expect(formatTimeLabel('not-a-time', 'HH:mm')).toBeNull();
  });

  test('is12HourTimeFormat resolves 12h vs 24h correctly', () => {
    expect(is12HourTimeFormat('HH:mm')).toBe(false);
    expect(is12HourTimeFormat('h:mm A')).toBe(true);
    expect(is12HourTimeFormat('h:mm a')).toBe(true);
    // In English locale default, should be 12-hour
    expect(is12HourTimeFormat()).toBe(true);
  });

  test('formatDateToTimeLabel reads the clock in the given time zone', () => {
    // 13:30 UTC is 15:30 in Berlin (CEST) and 09:30 in New York (EDT).
    const instant = new Date('2026-07-01T13:30:00Z');
    expect(formatDateToTimeLabel(instant, 'HH:mm', 'en', 'Europe/Berlin')).toBe(
      '15:30'
    );
    expect(
      formatDateToTimeLabel(instant, 'HH:mm', 'en', 'America/New_York')
    ).toBe('09:30');
    expect(
      formatDateToTimeLabel(instant, 'h:mm a', 'en-US', 'Europe/Berlin')
    ).toBe('3:30 PM');
    expect(formatDateToTimeLabel(instant, null, 'en-US', 'Asia/Tokyo')).toBe(
      '10:30 PM'
    );
  });

  test('formatDateToTimeLabel keeps the device clock without a time zone', () => {
    const instant = new Date('2026-07-01T13:30:00Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(formatDateToTimeLabel(instant, 'HH:mm')).toBe(
      `${pad(instant.getHours())}:${pad(instant.getMinutes())}`
    );
  });
});
