import {
  instantHourMinuteInZone,
  resolveRecordZone,
  type RecordZone,
} from '@workspace/shared';
import type { TFunction } from 'i18next';

import type { SleepEntry } from '../types/sleep';
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
  t: TFunction
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
 * The zone a session's clock times should be read in: the zone it was recorded in, else
 * the account's profile timezone.
 *
 * A bedtime means the hour the user went to bed, not the hour that instant maps to on the
 * phone's current clock — someone who flies to Tokyo must not find last week's nights
 * shifted nine hours. Both fallbacks route through `resolveRecordZone`, so a profile
 * timezone this runtime cannot resolve is rejected rather than handed to `Intl`, which
 * would throw on it.
 *
 * Returns null when neither is usable, which leaves the caller rendering device-local —
 * the same behaviour as before per-record zones were stored, and the only honest answer
 * when nothing recorded where the user was.
 */
export const resolveSleepZone = (
  entry: Pick<SleepEntry, 'record_timezone' | 'record_utc_offset_minutes'>,
  profileTimezone?: string | null
): RecordZone | null =>
  resolveRecordZone(entry.record_timezone, entry.record_utc_offset_minutes) ??
  resolveRecordZone(profileTimezone, null);

/**
 * Formats an ISO instant as a clock time, honouring the account's `time_format`
 * preference exactly as diary food entries do.
 *
 * `zone` is the wall clock to read the instant against — see {@link resolveSleepZone}.
 * Omitting it falls back to the device's own clock, which is only right when nothing is
 * known about where the record was made.
 */
export const formatClockTime = (
  iso: string | null | undefined,
  timeFormat?: EntryTimeFormat | null,
  zone?: RecordZone | null
): string => {
  if (!iso) return VALUE_PLACEHOLDER;

  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return VALUE_PLACEHOLDER;

  const { hour, minute } = zone
    ? instantHourMinuteInZone(instant, zone)
    : { hour: instant.getHours(), minute: instant.getMinutes() };

  const hours = String(hour).padStart(2, '0');
  const minutes = String(minute).padStart(2, '0');
  return (
    formatTimeLabel(`${hours}:${minutes}`, timeFormat) ?? VALUE_PLACEHOLDER
  );
};
