/**
 * Converts a timestamp to a local date string (YYYY-MM-DD).
 * This ensures dates are assigned based on the user's local timezone,
 * not UTC (which would cause issues like data at 11pm being assigned to the next day).
 */
export const toLocalDateString = (timestamp: string | Date): string => {
  const localDate = new Date(timestamp);
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
};

/** Returns the device's IANA timezone (e.g. 'America/New_York'). */
export const getDeviceTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Derives a YYYY-MM-DD date string from a UTC timestamp using a fixed UTC offset.
 * Used for Health Connect records that carry per-record zone offsets, so the day
 * bucket reflects where the record was created rather than the current device timezone.
 */
export const toDateStringWithOffset = (timestamp: string | Date, offsetMinutes: number): string => {
  const utcMs = new Date(timestamp).getTime();
  const localMs = utcMs + offsetMinutes * 60 * 1000;
  const d = new Date(localMs);
  // Use UTC methods since we already applied the offset manually
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// Get today's date in YYYY-MM-DD format (local timezone)
export const getTodayDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Add or subtract days from a YYYY-MM-DD date string
export const addDays = (dateString: string, days: number): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Strip any time/timezone suffix from a date string, returning just YYYY-MM-DD
export const normalizeDate = (dateString: string): string => dateString.split('T')[0];

// Format a YYYY-MM-DD date for display ("Mon, Jan 6")
export const formatDate = (dateString: string): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Format a YYYY-MM-DD date for display ("Today", "Yesterday", or "Mon, Jan 6")
export const formatDateLabel = (dateString: string): string => {
  const today = getTodayDate();
  if (dateString === today) return 'Today';
  if (dateString === addDays(today, -1)) return 'Yesterday';
  return formatDate(dateString);
};