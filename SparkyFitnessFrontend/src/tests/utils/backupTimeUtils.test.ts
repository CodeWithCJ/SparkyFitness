import { getLocalTimeString } from '@/pages/Admin/backupTimeUtils';

// Fixed reference date: 2024-01-15 at UTC midnight.
// Using a fixed date makes results independent of the test machine's local timezone
// because toLocaleTimeString with hourCycle:'h23' returns the local equivalent of the UTC time we set.
const FIXED_DATE = new Date('2024-01-15T00:00:00.000Z');

describe('getLocalTimeString', () => {
  it('returns 02:00 when utcTimeStr is undefined', () => {
    expect(getLocalTimeString(undefined, FIXED_DATE)).toBe('02:00');
  });

  it('returns 02:00 when utcTimeStr is empty string', () => {
    expect(getLocalTimeString('', FIXED_DATE)).toBe('02:00');
  });

  it('returns 02:00 for malformed input', () => {
    expect(getLocalTimeString('bad', FIXED_DATE)).toBe('02:00');
    expect(getLocalTimeString('99:99', FIXED_DATE)).toBe('02:00');
    expect(getLocalTimeString(':', FIXED_DATE)).toBe('02:00');
  });

  it('handles midnight UTC (00:00) without corrupting to current time', () => {
    const expected = new Date(FIXED_DATE);
    expected.setUTCHours(0, 0, 0, 0);
    const expectedStr = `${String(expected.getHours()).padStart(2, '0')}:${String(expected.getMinutes()).padStart(2, '0')}`;
    expect(getLocalTimeString('00:00', FIXED_DATE)).toBe(expectedStr);
  });

  it('handles times with zero minutes (e.g. 01:00) correctly', () => {
    const expected = new Date(FIXED_DATE);
    expected.setUTCHours(1, 0, 0, 0);
    const expectedStr = `${String(expected.getHours()).padStart(2, '0')}:${String(expected.getMinutes()).padStart(2, '0')}`;
    expect(getLocalTimeString('01:00', FIXED_DATE)).toBe(expectedStr);
  });

  it('handles end-of-day UTC time (23:59)', () => {
    const expected = new Date(FIXED_DATE);
    expected.setUTCHours(23, 59, 0, 0);
    const expectedStr = `${String(expected.getHours()).padStart(2, '0')}:${String(expected.getMinutes()).padStart(2, '0')}`;
    expect(getLocalTimeString('23:59', FIXED_DATE)).toBe(expectedStr);
  });

  it('returns a consistent result for the same input on multiple calls', () => {
    const a = getLocalTimeString('14:30', FIXED_DATE);
    const b = getLocalTimeString('14:30', FIXED_DATE);
    expect(a).toBe(b);
  });

  it('produces different results for different UTC times', () => {
    const morning = getLocalTimeString('08:00', FIXED_DATE);
    const evening = getLocalTimeString('20:00', FIXED_DATE);
    expect(morning).not.toBe(evening);
  });
});
