import { formatDose, getDueDosesForDate } from '@workspace/shared';
import type { MedicationDetail, MedicationEntry } from '@workspace/shared';
import type {
  WatchMedicationDosePayload,
  WatchMedicationTakenPayload,
} from '../../modules/watch-connectivity';
import type { EntryTimeFormat } from './entryTimeDisplay';
import { formatLocalizedTimeOfDay } from './medicationScheduleLocalization';
import { doseSlotStatus } from './medications';

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
 * Matches a logged entry to one scheduled watch dose slot.
 * Exact `schedule_id` matches always win. A legacy schedule-less entry
 * (`schedule_id == null`, excluding `prn_taken`) is only matched when
 * `allowLegacyFallback` is true (i.e. the medication has exactly one due
 * scheduled slot on that date), matching Wear OS's single-slot legacy rule so
 * multi-slot medications never mark two slots taken from one legacy row.
 */
function findEntryForWatchScheduledSlot(
  entries: readonly MedicationEntry[],
  medicationId: string,
  scheduleId: string,
  allowLegacyFallback: boolean
): MedicationEntry | undefined {
  const exact = entries.find((e) => e.schedule_id === scheduleId);
  if (exact) return exact;
  if (!allowLegacyFallback) return undefined;
  return entries.find(
    (e) =>
      e.medication_id === medicationId &&
      !e.schedule_id &&
      e.status !== 'prn_taken'
  );
}

/**
 * Today's dose slots, in the shape the watch's Medications page draws:
 * scheduled slots soonest first (untimed last), then as-needed medications
 * (no schedule, or a PRN schedule) as a single untimed row each with an empty
 * `scheduleId`. A new medication therefore shows up on the watch before it has
 * a schedule.
 *
 * Legacy schedule-less entries only bind to a scheduled slot when the
 * medication has exactly one due slot on `date`, keeping phone context and
 * Wear OS direct refresh in agreement.
 */
export function medicationsForWatch(
  medications: readonly MedicationDetail[],
  entries: readonly MedicationEntry[],
  date: string,
  timezone: string,
  timeFormat?: EntryTimeFormat | null
): WatchMedicationDosePayload[] {
  const dueDoses = getDueDosesForDate([...medications], date, timezone);
  const dueCountByMedication = new Map<string, number>();
  for (const due of dueDoses) {
    dueCountByMedication.set(
      due.medication.id,
      (dueCountByMedication.get(due.medication.id) ?? 0) + 1
    );
  }
  const scheduled = dueDoses.map((due) => {
    const entry = findEntryForWatchScheduledSlot(
      entries,
      due.medication.id,
      due.schedule.id,
      dueCountByMedication.get(due.medication.id) === 1
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
  });
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
 *   entry for it is updated rather than a second one created when
 *   `allowLegacyFallback` is true (single due slot on the day).
 */
export function watchMedicationWrite(
  payload: Pick<
    WatchMedicationTakenPayload,
    'medicationId' | 'scheduleId' | 'taken' | 'skipped'
  >,
  entries: readonly MedicationEntry[],
  options?: { allowLegacyFallback?: boolean }
): WatchMedicationWrite {
  const asNeeded = !payload.scheduleId;
  const allowLegacyFallback = options?.allowLegacyFallback ?? true;
  const existing = asNeeded
    ? entries.find(
        (e) =>
          e.medication_id === payload.medicationId && e.status === 'prn_taken'
      )
    : findEntryForWatchScheduledSlot(
        entries,
        payload.medicationId,
        payload.scheduleId,
        allowLegacyFallback
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
