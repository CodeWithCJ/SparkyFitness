// Persisted identifiers only. User-visible labels are resolved at render time
// through medicationLocalization so language changes do not leave stale labels.
export const SCHEDULE_TYPES = [
  'daily', 'weekly', 'every_n_days', 'monthly', 'cyclic', 'prn',
] as const;

export const MEDICATION_TYPES = [
  'pill', 'tablet', 'capsule', 'liquid', 'injection', 'patch', 'inhaler', 'drops',
  'nasal_spray', 'cream', 'suppository', 'other',
] as const;

export type MedicationTypeId = (typeof MEDICATION_TYPES)[number];
export type ScheduleTypeId = (typeof SCHEDULE_TYPES)[number];

export const medicationTypeFallbacks: Record<string, string> = {
  pill: 'Pill', tablet: 'Tablet', capsule: 'Capsule', liquid: 'Liquid', injection: 'Injection',
  patch: 'Patch', inhaler: 'Inhaler', drops: 'Drops', nasal_spray: 'Nasal Spray', cream: 'Cream',
  suppository: 'Suppository', other: 'Other',
};

export const scheduleTypeFallbacks: Record<string, string> = {
  daily: 'Daily', weekly: 'Specific days', every_n_days: 'Every N days', monthly: 'Monthly',
  cyclic: 'Cycle (on/off)', prn: 'As needed',
};
