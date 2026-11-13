import {
  localDateTimeToUtc,
  utcToLocalDateTimeInput,
  type MedicationDetail,
  type SharedScheduleRule,
} from '@workspace/shared';

/** Scheduled dose slots on a day, as returned by `getDueDosesForDate`. */
interface DueSlot {
  medication: { id: string };
  schedule: SharedScheduleRule & { id: string };
}

/**
 * The active medications logged on demand: those with no schedule, or a PRN one.
 *
 * Pass the day's due doses to leave out a medication that already has a slot that day,
 * so it is not offered twice; omit them to list every as-needed medication.
 */
export function selectPrnMedications(
  medications: MedicationDetail[],
  dueDoses: DueSlot[] = []
): MedicationDetail[] {
  const dueIds = new Set(dueDoses.map((d) => d.medication.id));
  return medications.filter((med) => {
    if (!med.is_active) return false;
    if (dueIds.has(med.id)) return false;
    if (!med.schedules || med.schedules.length === 0) return true;
    return med.schedules.some((s) => s.schedule_type_id === 'prn');
  });
}

/** Moves a 'YYYY-MM' month by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = (year ?? 1970) * 12 + ((monthNumber ?? 1) - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

/** Localized "October 2026" for a 'YYYY-MM' month. */
export function formatMonthLabel(month: string, locale: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1, 1));
  return date.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The 'HH:MM' a logged dose shows in the given timezone. */
export function entryTimeOfDay(takenAt: string, timezone: string): string {
  return utcToLocalDateTimeInput(takenAt, timezone).slice(11, 16);
}

/**
 * The instant for an edited time of day on a logged dose's calendar day, interpreted in
 * the given timezone. The day stays put, so editing the time never moves the entry to
 * another date.
 */
export function editedTakenAt(
  entryDate: string,
  timeOfDay: string,
  timezone: string
): string {
  return localDateTimeToUtc(
    `${entryDate.slice(0, 10)}T${timeOfDay}`,
    timezone
  ).toISOString();
}

/** Narrow weekday headers ('S', 'M', ...) starting on the given first day of the week. */
export function weekdayHeaders(
  firstDayOfWeek: number,
  locale: string
): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    // 2023-01-01 was a Sunday, so day-of-week n falls on January 1 + n.
    const date = new Date(Date.UTC(2023, 0, 1 + ((firstDayOfWeek + i) % 7)));
    return date.toLocaleDateString(locale, {
      weekday: 'narrow',
      timeZone: 'UTC',
    });
  });
}
