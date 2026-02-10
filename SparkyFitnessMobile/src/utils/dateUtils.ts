/**
 * Converts a timestamp to a local date string (YYYY-MM-DD).
 * This ensures dates are assigned based on the user's local timezone,
 * not UTC (which would cause issues like data at 11pm being assigned to the next day).
 */
export const toLocalDateString = (timestamp: string | Date): string => {
  const localDate = new Date(timestamp);
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
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

// Format a YYYY-MM-DD date for display ("Mon, Jan 6")
export const formatDate = (dateString: string): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Format a YYYY-MM-DD date for display ("Today" or "Mon, Jan 6")
export const formatDateLabel = (dateString: string): string => {
  if (dateString === getTodayDate()) return 'Today';
  return formatDate(dateString);
};