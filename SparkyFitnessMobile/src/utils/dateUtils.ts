import { localDateToDay } from '@workspace/shared';

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
export const formatDate = (dateString: string, locale = 'en-US'): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
};

// Format a YYYY-MM-DD date for short display ("Jun 30")
export const formatShortDate = (dateString: string): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Format a YYYY-MM-DD date for display ("Today", "Yesterday", or "Mon, Jan 6")
export const formatDateLabel = (dateString: string): string => {
  const today = getTodayDate();
  if (dateString === today) return 'Today';
  if (dateString === addDays(today, -1)) return 'Yesterday';
  return formatDate(dateString);
};

// Format a timestamp as a human-readable relative time ("Just now", "3 minutes ago", etc.)
export interface RelativeTimeTranslator {
  (key: string, options: Record<string, unknown>): string;
}

export const formatRelativeTime = (timestamp: Date | null, t?: RelativeTimeTranslator): string => {
  const translate = t ?? ((key: string, options: Record<string, unknown>) => {
    const defaults: Record<string, string> = {
      'date.neverSynced': 'Never synced',
      'date.justNow': 'Just now',
      'date.minutesAgo': '{{count}} minute{{plural}} ago',
      'date.hoursAgo': '{{count}} hour{{plural}} ago',
      'date.yesterdayAt': 'Yesterday at {{time}}',
      'date.onDateAt': '{{date}} at {{time}}',
    };
    let value = defaults[key] ?? key;
    for (const [name, replacement] of Object.entries(options)) value = value.replace(`{{${name}}}`, String(replacement));
    if (key === 'date.minutesAgo' || key === 'date.hoursAgo') value = value.replace('{{plural}}', Number(options.count) === 1 ? '' : 's');
    return value;
  });
  if (!timestamp) return translate('date.neverSynced', { defaultValue: 'Never synced' });

  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return translate('date.justNow', { defaultValue: 'Just now' });
  } else if (diffMinutes < 60) {
    return translate('date.minutesAgo', { defaultValue: '{{count}} minute{{plural}} ago', count: diffMinutes, plural: diffMinutes === 1 ? '' : 's' });
  } else if (diffHours < 24) {
    return translate('date.hoursAgo', { defaultValue: '{{count}} hour{{plural}} ago', count: diffHours, plural: diffHours === 1 ? '' : 's' });
  } else if (diffDays === 1) {
    return translate('date.yesterdayAt', { defaultValue: 'Yesterday at {{time}}', time: timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
  } else {
    return translate('date.onDateAt', { defaultValue: '{{date}} at {{time}}', date: timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' }), time: timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
  }
};