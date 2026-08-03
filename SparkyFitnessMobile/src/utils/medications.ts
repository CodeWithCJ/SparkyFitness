import type { MedicationDetail, MedicationEntry, SharedScheduleRule } from '@workspace/shared';

/** A scheduled dose slot on a given day, as produced by getDueDosesForDate. */
export interface DueDose {
  medication: MedicationDetail;
  schedule: SharedScheduleRule & { id: string };
}

/**
 * True when a logged entry belongs to the given dose slot.
 *
 * Entries logged without schedule attribution (e.g. from the web app) count
 * for any of the medication's scheduled doses, except PRN logs, which never
 * cover a scheduled slot. A null scheduleId matches only the medication's
 * schedule-less entries.
 */
export function entryMatchesDose(
  entry: MedicationEntry,
  medicationId: string,
  scheduleId: string | null,
): boolean {
  if (scheduleId) {
    if (entry.schedule_id === scheduleId) return true;
    return (
      entry.medication_id === medicationId && !entry.schedule_id && entry.status !== 'prn_taken'
    );
  }
  return entry.medication_id === medicationId && !entry.schedule_id;
}

export type DoseSlotStatus = 'pending' | 'taken' | 'skipped';

/** Maps a slot's matched entry (if any) to its display status. */
export function doseSlotStatus(entry: MedicationEntry | undefined): DoseSlotStatus {
  if (entry?.status === 'taken' || entry?.status === 'prn_taken') return 'taken';
  if (entry?.status === 'skipped') return 'skipped';
  return 'pending';
}

/** True when the dose slot already has a terminal (taken or skipped) entry. */
export function isDoseLogged(
  entries: MedicationEntry[],
  medicationId: string,
  scheduleId: string | null,
): boolean {
  return entries.some(
    (e) =>
      entryMatchesDose(e, medicationId, scheduleId) &&
      (e.status === 'taken' || e.status === 'skipped'),
  );
}
