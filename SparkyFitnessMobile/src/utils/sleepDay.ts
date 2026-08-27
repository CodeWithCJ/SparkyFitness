import type { TFunction } from 'i18next';

import { formatTimeLabel, type EntryTimeFormat } from './entryTimeDisplay';

/**
 * Rendered wherever a value is missing or unparseable. An em dash rather than localized
 * copy, so it reads the same in every language and can never surface `'Invalid Date'`.
 */
const VALUE_PLACEHOLDER = '—';

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

/**
 * Formats a sleep span as `'7h 30m'`, or `'45m'` when it is under an hour.
 */
export const formatSleepDuration = (
  seconds: number | null | undefined,
  t: TFunction,
): string => {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return t('sleep.valueUnavailable', { defaultValue: '—' });
  }

  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const minutesLabel = `${minutes}${t('time.minutesShort', { defaultValue: 'm' })}`;

  if (hours === 0) return minutesLabel;
  return `${hours}${t('time.hoursShort', { defaultValue: 'h' })} ${minutesLabel}`;
};

/**
 * Formats an ISO instant as a clock time, honouring the account's `time_format`
 * preference exactly as diary food entries do.
 */
export const formatClockTime = (
  iso: string | null | undefined,
  timeFormat?: EntryTimeFormat | null,
): string => {
  if (!iso) return VALUE_PLACEHOLDER;

  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return VALUE_PLACEHOLDER;

  const hours = String(instant.getHours()).padStart(2, '0');
  const minutes = String(instant.getMinutes()).padStart(2, '0');
  return formatTimeLabel(`${hours}:${minutes}`, timeFormat) ?? VALUE_PLACEHOLDER;
};
