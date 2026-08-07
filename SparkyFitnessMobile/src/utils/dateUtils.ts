import { localDateToDay } from '@workspace/shared';
import { getAppLocale } from '../localization';

export const toLocalDateString = (timestamp: string | Date): string => {
  const localDate = typeof timestamp === 'string' || typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return localDateToDay(localDate);
};

export const getDeviceTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

export const toDateStringWithOffset = (timestamp: string | Date, offsetMinutes: number): string => {
  const utcMs = new Date(timestamp).getTime();
  const localMs = utcMs + offsetMinutes * 60 * 1000;
  const d = new Date(localMs);
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

export const addDays = (dateString: string, days: number): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const normalizeDate = (dateString: string): string => dateString.split('T')[0];

export const formatDate = (dateString: string): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(getAppLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
};

export const formatShortDate = (dateString: string): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(getAppLocale(), { month: 'short', day: 'numeric' });
};

export const formatDateLabel = (dateString: string): string => {
  const today = getTodayDate();
  if (dateString === today) return 'Today';
  if (dateString === addDays(today, -1)) return 'Yesterday';
  return formatDate(dateString);
};

export const formatRelativeTime = (timestamp: Date | null): string => {
  if (!timestamp) return 'Never synced';

  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return `Yesterday at ${timestamp.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  } else {
    return `${timestamp.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    })} at ${timestamp.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }
};
