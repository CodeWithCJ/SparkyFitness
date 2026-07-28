// UI-only medication constants. The API contract types live in
// @workspace/shared (shared/src/medications/contracts.ts).

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

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
