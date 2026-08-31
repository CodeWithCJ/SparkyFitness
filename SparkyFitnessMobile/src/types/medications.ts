// Persisted identifiers only. User-visible labels are resolved at render time
// through medicationLocalization so language changes do not leave stale labels.
export const SCHEDULE_TYPES = [
  'daily',
  'weekly',
  'every_n_days',
  'monthly',
  'cyclic',
  'prn',
] as const;

export const MEDICATION_TYPES = [
  'pill',
  'tablet',
  'capsule',
  'liquid',
  'injection',
  'patch',
  'inhaler',
  'drops',
  'nasal_spray',
  'cream',
  'suppository',
  'other',
] as const;

export type MedicationTypeId = (typeof MEDICATION_TYPES)[number];
export type ScheduleTypeId = (typeof SCHEDULE_TYPES)[number];
