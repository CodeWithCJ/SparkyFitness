import type { MedicationEntry } from '@/types/medications';

/**
 * True when a logged entry belongs to a scheduled due dose slot.
 *
 * Entries logged without schedule attribution (e.g. via API or iOS Shortcuts)
 * count for any of the medication's scheduled doses, except PRN logs, which
 * never cover a scheduled slot.
 */
export const entryMatchesDue = (
  e: MedicationEntry,
  due: { medication: { id: string }; schedule: { id: string } }
): boolean => {
  if (e.status === 'prn_taken') return false;

  return (
    e.schedule_id === due.schedule.id ||
    (e.entry_type === 'injection' && e.medication_id === due.medication.id) ||
    (e.medication_id === due.medication.id && !e.schedule_id)
  );
};
