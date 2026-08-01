// UI-only medication constants. The API contract types live in
// @workspace/shared (shared/src/medications/contracts.ts).

export const SCHEDULE_TYPES = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Specific days' },
  { id: 'every_n_days', label: 'Every N days' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'cyclic', label: 'Cycle (on/off)' },
  { id: 'prn', label: 'As needed' },
] as const;

export const MEDICATION_TYPES = [
  { id: 'pill', label: 'Pill' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'capsule', label: 'Capsule' },
  { id: 'liquid', label: 'Liquid' },
  { id: 'injection', label: 'Injection' },
  { id: 'patch', label: 'Patch' },
  { id: 'inhaler', label: 'Inhaler' },
  { id: 'drops', label: 'Drops' },
  { id: 'nasal_spray', label: 'Nasal Spray' },
  { id: 'cream', label: 'Cream' },
  { id: 'suppository', label: 'Suppository' },
  { id: 'other', label: 'Other' },
] as const;
