/**
 * Converts a timestamp to a local date string (YYYY-MM-DD).
 * This ensures dates are assigned based on the user's local timezone,
 * not UTC (which would cause issues like data at 11pm being assigned to the next day).
 */
export const toLocalDateString = (timestamp: string | Date): string => {
  const localDate = new Date(timestamp);
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
};
