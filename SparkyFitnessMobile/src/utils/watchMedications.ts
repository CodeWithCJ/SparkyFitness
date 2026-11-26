import { formatDose, getDueDosesForDate } from '@workspace/shared';
import type { MedicationDetail, MedicationEntry } from '@workspace/shared';
import type {
  WatchMedicationDosePayload,
  WatchMedicationTakenPayload,
} from '../../modules/watch-connectivity';
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
        supplement: Boolean(due.medication.is_supplement),
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
      supplement: Boolean(med.is_supplement),
    };
  });
  return [...scheduled, ...asNeeded];
}

/** What a dose tap from the watch does to the day's entries. */
export type WatchMedicationWrite =
  | { kind: 'none' }
  | { kind: 'delete'; entryId: string }
  | { kind: 'update'; entryId: string; status: 'taken' | 'skipped' }
  | { kind: 'create'; status: 'taken' | 'skipped' | 'prn_taken' };

/**
 * Decides the write for one dose tap from the watch, from the day's entries.
 * Reading them first is what makes a redelivered tap safe: a slot already in
 * the asked-for state is left alone.
 *
 * - An empty `scheduleId` is an as-needed row: it logs a `prn_taken` entry
 *   like the phone's PRN button, once per day. It has no slot to skip.
 * - `skipped: true` marks a scheduled slot skipped.
 * - `taken: false` (an un-tick) clears the slot, whether it was taken or
 *   skipped.
 * - Otherwise the slot is marked taken. A skipped or schedule-less (web-logged)
 *   entry for it is updated rather than a second one created, as the phone's
 *   own dose row does.
 */
export function watchMedicationWrite(
  payload: Pick<
    WatchMedicationTakenPayload,
    'medicationId' | 'scheduleId' | 'taken' | 'skipped'
  >,
  entries: readonly MedicationEntry[]
): WatchMedicationWrite {
  const asNeeded = !payload.scheduleId;
  const existing = asNeeded
    ? entries.find(
        (e) =>
          e.medication_id === payload.medicationId && e.status === 'prn_taken'
      )
    : entries.find((e) =>
        entryMatchesDose(e, payload.medicationId, payload.scheduleId)
      );
  const taken =
    existing?.status === 'taken' || existing?.status === 'prn_taken';
  const skipped = existing?.status === 'skipped';
  const skip = payload.skipped === true && !asNeeded;

  if (!skip && payload.taken === false) {
    return existing && (taken || skipped)
      ? { kind: 'delete', entryId: existing.id }
      : { kind: 'none' };
  }
  const status = skip ? 'skipped' : 'taken';
  if (skip ? skipped : taken) return { kind: 'none' };
  if (existing) return { kind: 'update', entryId: existing.id, status };
  return { kind: 'create', status: asNeeded ? 'prn_taken' : status };
}
