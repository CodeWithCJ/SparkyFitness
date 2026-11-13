/** Scales a symptom's severity can be entered on. */
export const SYMPTOM_SCALE_TYPES = [
  '1-5',
  '1-10',
  'none-severe',
  'count',
  'text',
] as const;
export type SymptomScaleType = (typeof SYMPTOM_SCALE_TYPES)[number];

export const SYMPTOM_DEFINITION_CATEGORIES = [
  'general',
  'pain',
  'head',
  'gi',
  'respiratory',
  'skin',
  'mental',
  'other',
] as const;
export type SymptomDefinitionCategory =
  (typeof SYMPTOM_DEFINITION_CATEGORIES)[number];

/**
 * A template is a preset bundle of detail sections. The log form renders only
 * the sections a symptom's template (plus its per-symptom overrides) enables.
 */
export const SYMPTOM_TEMPLATES = [
  'generic',
  'headache',
  'pain',
  'gi',
  'respiratory',
  'skin',
  'mental',
] as const;
export type SymptomTemplate = (typeof SYMPTOM_TEMPLATES)[number];

export const SYMPTOM_SECTIONS = [
  'timing',
  'severity',
  'locations',
  'phases',
  'qualities',
  'associated',
  'triggers',
  'treatments',
  'impact',
  'notes',
  'medication',
  'bristol',
  'photos',
  'custom_fields',
] as const;
export type SymptomSection = (typeof SYMPTOM_SECTIONS)[number];

/** Kinds of entries in the user's pick-list library (`user_symptom_options`). */
export const SYMPTOM_OPTION_KINDS = [
  'location',
  'head_location',
  'quality',
  'associated',
  'trigger',
  'relief',
] as const;
export type SymptomOptionKind = (typeof SYMPTOM_OPTION_KINDS)[number];

export const SYMPTOM_IMPACT_LEVELS = [
  'none',
  'mild',
  'moderate',
  'severe',
] as const;
export type SymptomImpact = (typeof SYMPTOM_IMPACT_LEVELS)[number];

export const TREATMENT_KINDS = ['medication', 'relief'] as const;
export type TreatmentKind = (typeof TREATMENT_KINDS)[number];

/** Did a treatment work? `null` means it has not been rated yet. */
export const TREATMENT_EFFECTIVENESS = ['none', 'partial', 'full'] as const;
export type TreatmentEffectiveness = (typeof TREATMENT_EFFECTIVENESS)[number];

export const SYMPTOM_PHASES = ['prodrome', 'aura', 'postdrome'] as const;
export type SymptomPhase = (typeof SYMPTOM_PHASES)[number];

export const CUSTOM_FIELD_TYPES = [
  'number',
  'text',
  'boolean',
  'select',
  'multiselect',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** A user-defined extra field on a symptom, e.g. "Rash size (cm)". */
export interface SymptomCustomFieldDef {
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  unit?: string;
}

/** `symptom_entries.source` values with a defined meaning. */
export const SYMPTOM_SOURCE_MANUAL = 'manual';
export const SYMPTOM_SOURCE_CYCLE = 'cycle';
