import { z } from 'zod';
import {
  CUSTOM_FIELD_TYPES,
  SYMPTOM_DEFINITION_CATEGORIES,
  SYMPTOM_IMPACT_LEVELS,
  SYMPTOM_OPTION_KINDS,
  SYMPTOM_SCALE_TYPES,
  SYMPTOM_SECTIONS,
  SYMPTOM_TEMPLATES,
  TREATMENT_EFFECTIVENESS,
  TREATMENT_KINDS,
} from '../../symptoms/constants.ts';

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const uuid = z.string().uuid();
const optionalNullableString = z.string().nullable().optional();
const stringList = z.array(z.string().min(1).max(120)).max(60);

// --- Definitions -------------------------------------------------------------

export const symptomCustomFieldDefSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'key must be lowercase letters, digits or _'),
  label: z.string().min(1).max(60),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string().min(1).max(60)).max(30).optional(),
  unit: z.string().max(20).optional(),
});

const sectionOverridesSchema = z.partialRecord(
  z.enum(SYMPTOM_SECTIONS),
  z.boolean()
);

export const createSymptomDefinitionBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(80),
  display_name: optionalNullableString,
  scale_type: z.enum(SYMPTOM_SCALE_TYPES).optional(),
  unit: optionalNullableString,
  is_glp1_flagged: z.boolean().optional(),
  category: z.enum(SYMPTOM_DEFINITION_CATEGORIES).optional(),
  template: z.enum(SYMPTOM_TEMPLATES).optional(),
  sections: sectionOverridesSchema.optional(),
  custom_field_defs: z.array(symptomCustomFieldDefSchema).max(20).optional(),
  is_episodic: z.boolean().optional(),
  color: optionalNullableString,
  icon: optionalNullableString,
  is_pinned: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  is_archived: z.boolean().optional(),
});

export const updateSymptomDefinitionBodySchema =
  createSymptomDefinitionBodySchema.partial();

export const symptomDefinitionResponseSchema = z.object({
  id: uuid,
  user_id: uuid,
  name: z.string(),
  display_name: z.string().nullable(),
  scale_type: z.enum(SYMPTOM_SCALE_TYPES),
  unit: z.string().nullable(),
  is_glp1_flagged: z.boolean(),
  category: z.enum(SYMPTOM_DEFINITION_CATEGORIES),
  template: z.enum(SYMPTOM_TEMPLATES),
  sections: sectionOverridesSchema,
  custom_field_defs: z.array(symptomCustomFieldDefSchema),
  is_episodic: z.boolean(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  is_pinned: z.boolean(),
  sort_order: z.number(),
  is_archived: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

// --- Options (pick-list library) ---------------------------------------------

export const createSymptomOptionBodySchema = z.object({
  kind: z.enum(SYMPTOM_OPTION_KINDS),
  name: z.string().min(1, 'Name is required').max(80),
  sort_order: z.number().int().optional(),
  is_hidden: z.boolean().optional(),
});

export const updateSymptomOptionBodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  sort_order: z.number().int().optional(),
  is_hidden: z.boolean().optional(),
});

export const listSymptomOptionsQuerySchema = z.object({
  kind: z.enum(SYMPTOM_OPTION_KINDS).optional(),
});

export const symptomOptionResponseSchema = z.object({
  id: uuid,
  user_id: uuid,
  kind: z.enum(SYMPTOM_OPTION_KINDS),
  name: z.string(),
  sort_order: z.number(),
  is_hidden: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

// --- Treatments --------------------------------------------------------------

export const symptomTreatmentInputSchema = z.object({
  kind: z.enum(TREATMENT_KINDS),
  medication_id: uuid.nullable().optional(),
  medication_entry_id: uuid.nullable().optional(),
  name_snapshot: z.string().min(1).max(120),
  dose_snapshot: optionalNullableString,
  taken_at: optionalNullableString,
  effectiveness: z.enum(TREATMENT_EFFECTIVENESS).nullable().optional(),
  notes: optionalNullableString,
});

export const symptomTreatmentResponseSchema = z.object({
  id: uuid,
  user_id: uuid,
  symptom_entry_id: uuid,
  kind: z.enum(TREATMENT_KINDS),
  medication_id: z.string().nullable(),
  medication_entry_id: z.string().nullable(),
  name_snapshot: z.string(),
  dose_snapshot: z.string().nullable(),
  taken_at: z.string().nullable(),
  effectiveness: z.enum(TREATMENT_EFFECTIVENESS).nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

// --- Entries -----------------------------------------------------------------

const customFieldValues = z.record(z.string(), z.unknown());
const phasesSchema = z.record(z.string(), z.array(z.string().min(1).max(60)));

const entryFields = {
  medication_id: uuid.nullable().optional(),
  symptom_id: uuid.nullable().optional(),
  symptom_name_snapshot: z.string().min(1, 'Symptom name is required').max(120),
  severity: z.number().nullable().optional(),
  severity_label: optionalNullableString,
  logged_at: optionalNullableString,
  entry_date: dayString.nullable().optional(),
  started_at: optionalNullableString,
  ended_at: optionalNullableString,
  body_location: optionalNullableString,
  body_locations: stringList.optional(),
  qualities: stringList.optional(),
  associated_symptoms: stringList.optional(),
  triggers: stringList.optional(),
  phases: phasesSchema.optional(),
  impact: z.enum(SYMPTOM_IMPACT_LEVELS).nullable().optional(),
  context_text: optionalNullableString,
  bristol_type: z.number().int().min(1).max(7).nullable().optional(),
  source: z.string().max(50).optional(),
  custom_fields: customFieldValues.nullable().optional(),
  treatments: z.array(symptomTreatmentInputSchema).max(20).optional(),
};

export const createSymptomEntryBodySchema = z.object(entryFields);

export const updateSymptomEntryBodySchema = z.object(entryFields).partial();

export const endSymptomEpisodeBodySchema = z.object({
  ended_at: optionalNullableString,
  treatments: z.array(symptomTreatmentInputSchema).max(20).optional(),
});

export const addSymptomSeverityBodySchema = z.object({
  severity: z.number(),
  at: optionalNullableString,
  // Impact at the same moment, appended to impact_timeline alongside severity.
  impact: z.enum(SYMPTOM_IMPACT_LEVELS).nullable().optional(),
});

const queryBool = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const listSymptomEntriesQuerySchema = z.object({
  fromDate: dayString.nullable().optional(),
  toDate: dayString.nullable().optional(),
  symptomName: optionalNullableString,
  symptomId: uuid.optional(),
  medicationId: uuid.optional(),
  source: z.string().max(50).optional(),
  episodesOnly: queryBool.optional(),
  // Also return episodes that overlap the date range without being logged in
  // it, such as one that started before fromDate and was still going, so a
  // calendar can mark every day an episode covers.
  overlapping: queryBool.optional(),
});

export const symptomEntryResponseSchema = z.object({
  id: uuid,
  user_id: uuid,
  medication_id: z.string().nullable(),
  symptom_id: z.string().nullable(),
  symptom_name_snapshot: z.string(),
  severity: z.number().nullable(),
  severity_label: z.string().nullable(),
  logged_at: z.string(),
  entry_date: dayString,
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  body_location: z.string().nullable(),
  body_locations: z.array(z.string()),
  qualities: z.array(z.string()),
  associated_symptoms: z.array(z.string()),
  triggers: z.array(z.string()),
  phases: phasesSchema,
  impact: z.enum(SYMPTOM_IMPACT_LEVELS).nullable(),
  peak_severity: z.number().nullable(),
  severity_timeline: z.array(
    z.object({ at: z.string(), severity: z.number() })
  ),
  // Optional so clients keep parsing responses from servers without it.
  impact_timeline: z
    .array(z.object({ at: z.string(), impact: z.enum(SYMPTOM_IMPACT_LEVELS) }))
    .optional(),
  context_text: z.string().nullable(),
  bristol_type: z.number().nullable(),
  source: z.string(),
  custom_fields: customFieldValues,
  treatments: z.array(symptomTreatmentResponseSchema),
  photo_ids: z.array(uuid),
  created_at: z.string(),
  updated_at: z.string(),
});

// --- Symptom-free days -------------------------------------------------------

export const markSymptomFreeBodySchema = z.object({
  entry_date: dayString.optional(),
});

export const listSymptomFreeDaysQuerySchema = z.object({
  fromDate: dayString.optional(),
  toDate: dayString.optional(),
});

export const symptomFreeDayResponseSchema = z.object({
  id: uuid,
  entry_date: dayString,
});

// --- Photos ------------------------------------------------------------------

export const symptomPhotoResponseSchema = z.object({
  id: uuid,
  symptom_entry_id: uuid,
  caption: z.string().nullable(),
  created_at: z.string(),
});

// --- Episode context ---------------------------------------------------------

/** How many entries one context request may cover. */
export const SYMPTOM_CONTEXT_MAX_IDS = 50;

export const symptomContextQuerySchema = z.object({
  ids: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
    .pipe(z.array(uuid).min(1).max(SYMPTOM_CONTEXT_MAX_IDS)),
});

/** What the diary holds for one calendar day around an entry. */
export const symptomContextDaySchema = z.object({
  date: dayString,
  label: z.enum(['day_before', 'day_of']),
  /** Names only: what was eaten, in the order it was logged. */
  foods: z.array(z.string()),
  water_ml: z.number().nullable(),
  steps: z.number().nullable(),
  workouts: z.array(z.string()),
});

/**
 * The diary around one entry, joined from data the user already logs. Any part
 * the caller may not read (a delegate without diary access, say) comes back
 * empty rather than as an error.
 */
export const symptomEpisodeContextSchema = z.object({
  entry_id: uuid,
  /** The last sleep that ended before the entry began. */
  sleep: z
    .object({
      minutes: z.number(),
      bedtime: z.string(),
      wake_time: z.string(),
    })
    .nullable(),
  days: z.array(symptomContextDaySchema),
  /** Doses taken while the episode was running. */
  medications: z.array(
    z.object({
      name: z.string(),
      dose: z.string().nullable(),
      taken_at: z.string(),
    })
  ),
  /** Owner only, and only when cycle tracking is on. */
  cycle: z
    .object({ phase: z.string(), cycle_day: z.number().nullable() })
    .nullable(),
});

// --- Types -------------------------------------------------------------------

export type CreateSymptomDefinitionBody = z.infer<
  typeof createSymptomDefinitionBodySchema
>;
export type UpdateSymptomDefinitionBody = z.infer<
  typeof updateSymptomDefinitionBodySchema
>;
export type SymptomDefinitionResponse = z.infer<
  typeof symptomDefinitionResponseSchema
>;
export type CreateSymptomOptionBody = z.infer<
  typeof createSymptomOptionBodySchema
>;
export type UpdateSymptomOptionBody = z.infer<
  typeof updateSymptomOptionBodySchema
>;
export type SymptomOptionResponse = z.infer<typeof symptomOptionResponseSchema>;
export type SymptomTreatmentInput = z.infer<typeof symptomTreatmentInputSchema>;
export type SymptomTreatmentResponse = z.infer<
  typeof symptomTreatmentResponseSchema
>;
export type CreateSymptomEntryBody = z.infer<
  typeof createSymptomEntryBodySchema
>;
export type UpdateSymptomEntryBody = z.infer<
  typeof updateSymptomEntryBodySchema
>;
export type EndSymptomEpisodeBody = z.infer<typeof endSymptomEpisodeBodySchema>;
export type AddSymptomSeverityBody = z.infer<
  typeof addSymptomSeverityBodySchema
>;
export type ListSymptomEntriesQuery = z.infer<
  typeof listSymptomEntriesQuerySchema
>;
export type SymptomEntryResponse = z.infer<typeof symptomEntryResponseSchema>;
export type SymptomFreeDayResponse = z.infer<
  typeof symptomFreeDayResponseSchema
>;
export type SymptomPhotoResponse = z.infer<typeof symptomPhotoResponseSchema>;
export type SymptomContextDay = z.infer<typeof symptomContextDaySchema>;
export type SymptomEpisodeContext = z.infer<typeof symptomEpisodeContextSchema>;
