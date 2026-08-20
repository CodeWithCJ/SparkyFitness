import { initializeI18n } from '../../src/localization/i18n';
import { formatTimeLabel } from '../../src/utils/entryTimeDisplay';

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
});
