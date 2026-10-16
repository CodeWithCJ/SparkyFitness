import { formatDose, getDueDosesForDate } from '@workspace/shared';
import type { MedicationDetail, MedicationEntry } from '@workspace/shared';
import type { WatchMedicationDosePayload } from '../../modules/watch-connectivity';
import type { EntryTimeFormat } from './entryTimeDisplay';
import { formatLocalizedTimeOfDay } from './medicationScheduleLocalization';
import { doseSlotStatus, entryMatchesDose } from './medications';

/** The id the watch and the phone both use to name one dose slot. */
export function watchDoseId(medicationId: string, scheduleId: string): string {
  return `${medicationId}:${scheduleId}`;
}

/** True for the medications the phone's card lists as as-needed rows. */
function isAsNeeded(med: MedicationDetail): boolean {
  if (!med.is_active) return false;
  if (!med.schedules || med.schedules.length === 0) return true;
  return med.schedules.some((s) => s.schedule_type_id === 'prn');
}

/**
 * Today's dose slots, in the shape the watch's Medications page draws:
 * scheduled slots soonest first (untimed last), then as-needed medications
 * (no schedule, or a PRN schedule) as a single untimed row each with an empty
 * `scheduleId`. A new medication therefore shows up on the watch before it has
 * a schedule.
 *
 * Status comes from the same entry matching the phone's own dose rows use
 * (`entryMatchesDose`), so the two never disagree about what is taken.
 */
export function medicationsForWatch(
  medications: readonly MedicationDetail[],
  entries: readonly MedicationEntry[],
  date: string,
  timezone: string,
  timeFormat?: EntryTimeFormat | null
): WatchMedicationDosePayload[] {
  const scheduled = getDueDosesForDate([...medications], date, timezone).map(
    (due) => {
      const entry = entries.find((e) =>
        entryMatchesDose(e, due.medication.id, due.schedule.id)
      );
      return {
        id: watchDoseId(due.medication.id, due.schedule.id),
        medicationId: due.medication.id,
        scheduleId: due.schedule.id,
        name: due.medication.name,
        detail: formatDose(due.medication, due.schedule) ?? '',
        time: due.schedule.time_of_day
          ? formatLocalizedTimeOfDay(
              due.schedule.time_of_day,
              undefined,
              timeFormat
            )
          : '',
        status: doseSlotStatus(entry),
      };
    }
  );
  const asNeeded = medications.filter(isAsNeeded).map((med) => {
    const entry = entries.find(
      (e) => e.medication_id === med.id && e.status === 'prn_taken'
    );
    return {
      id: watchDoseId(med.id, ''),
      medicationId: med.id,
      scheduleId: '',
      name: med.name,
      detail: formatDose(med) ?? '',
      time: '',
      status: doseSlotStatus(entry),
    };
  });
  return [...scheduled, ...asNeeded];
}
