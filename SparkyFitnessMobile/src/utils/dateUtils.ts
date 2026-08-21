import { localDateToDay } from '@workspace/shared';
import type { TFunction } from 'i18next';

/**
 * Converts a timestamp to a local date string (YYYY-MM-DD).
 * Delegates to the shared localDateToDay helper to ensure device-local calendar day consistency.
 */
export const toLocalDateString = (timestamp: string | Date): string => {
  const localDate = typeof timestamp === 'string' || typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return localDateToDay(localDate);
};

/** Returns the device's IANA timezone (e.g. 'America/New_York'). */
export const getDeviceTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

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
export const formatDate = (dateString: string, locale: string): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
};

// Format a YYYY-MM-DD date for short display ("Jun 30")
export const formatShortDate = (dateString: string, locale: string): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
};

// Format a YYYY-MM-DD date for display ("Today", "Yesterday", or "Mon, Jan 6")
export const formatDateLabel = (
  dateString: string,
  t: TFunction,
  locale: string,
): string => {
  const normalized = normalizeDate(dateString);
  const today = getTodayDate();
  if (normalized === today) return t('date.today', { defaultValue: 'Today' });
  if (normalized === addDays(today, -1)) return t('date.yesterday', { defaultValue: 'Yesterday' });
  return formatDate(normalized, locale);
};

// Format a timestamp as a human-readable relative time ("Just now", "3 minutes ago", etc.)
export interface RelativeTimeTranslator {
  (key: string, options: Record<string, unknown>): string;
}

export const formatRelativeTime = (timestamp: Date | null, translate: RelativeTimeTranslator, locale: string): string => {
  if (!timestamp) return translate('date.neverSynced', { defaultValue: 'Never synced' });

  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - timestamp.getTime()) / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const time = timestamp.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  if (diffSeconds < 60) return translate('date.justNow', { defaultValue: 'Just now' });
  if (diffMinutes < 60) return translate('date.minutesAgo', {
    count: diffMinutes,
    defaultValue: '{{count}} minute ago',
    defaultValue_one: '{{count}} minute ago',
    defaultValue_other: '{{count}} minutes ago',
  });
  if (diffHours < 24) return translate('date.hoursAgo', {
    count: diffHours,
    defaultValue: '{{count}} hour ago',
    defaultValue_one: '{{count}} hour ago',
    defaultValue_other: '{{count}} hours ago',
  });
  if (diffDays === 1) return translate('date.yesterdayAt', { time, defaultValue: 'Yesterday at {{time}}' });
  const date = timestamp.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return translate('date.onDateAt', { date, time, defaultValue: '{{date}} at {{time}}' });
};
