import { z } from 'zod/v4';
import { optionalNullableNumber, optionalNullableInt } from './schema.utils.js';

const customFields = z.record(z.string(), z.unknown()).nullable().optional();
const optionalNullableString = z.string().nullable().optional();
const optionalDateString = z.string().nullable().optional(); // 'YYYY-MM-DD'

// --------------------------------------------------------------------------
// Medications
// --------------------------------------------------------------------------
const MedicationFieldsSchema = z.object({
  name: z.string().min(1, 'name is required'),
  display_name: optionalNullableString,
  type_id: optionalNullableString,
  route_id: optionalNullableString,
  strength_value: optionalNullableNumber,
  strength_unit: optionalNullableString,
  dose_amount: optionalNullableNumber,
  dose_unit: optionalNullableString,
  rxnorm_rxcui: optionalNullableString,
  ndc: optionalNullableString,
  prescriber: optionalNullableString,
  pharmacy: optionalNullableString,
  rx_number: optionalNullableString,
  reason_text: optionalNullableString,
  effectiveness_rating: optionalNullableInt,
  color: optionalNullableString,
  icon: optionalNullableString,
  photo_path: optionalNullableString,
  is_active: z.boolean().optional(),
  is_quick: z.boolean().optional(),
  is_glp1: z.boolean().optional(),
  notes: optionalNullableString,
  source: z.string().optional(),
  custom_fields: customFields,
});

export const CreateMedicationBodySchema = MedicationFieldsSchema.loose();
export type CreateMedicationBody = z.infer<typeof CreateMedicationBodySchema>;

// Update is a partial patch — every field optional, including name.
export const UpdateMedicationBodySchema =
  MedicationFieldsSchema.partial().loose();
export type UpdateMedicationBody = z.infer<typeof UpdateMedicationBodySchema>;

// --------------------------------------------------------------------------
// Schedules
// --------------------------------------------------------------------------
export const CreateScheduleBodySchema = z
  .object({
    schedule_type_id: z.string().min(1, 'schedule_type_id is required'),
    time_of_day: optionalNullableString, // 'HH:MM' or 'HH:MM:SS'
    dose_amount: optionalNullableNumber,
    days_of_week: z.array(z.number().int().min(0).max(6)).nullable().optional(),
    interval_days: optionalNullableInt,
    day_of_month: z.number().int().min(1).max(31).nullable().optional(),
    cycle_on_days: optionalNullableInt,
    cycle_off_days: optionalNullableInt,
    with_meal: z.enum(['before', 'with', 'after']).nullable().optional(),
    prn_reason: optionalNullableString,
    prn_max_per_day: optionalNullableInt,
    start_date: optionalDateString,
    end_date: optionalDateString,
    active: z.boolean().optional(),
    source: z.string().optional(),
    custom_fields: customFields,
  })
  .loose();
export type CreateScheduleBody = z.infer<typeof CreateScheduleBodySchema>;

// --------------------------------------------------------------------------
// Pens / vials
// --------------------------------------------------------------------------
const PenFieldsSchema = z.object({
  kind: z.enum(['pen', 'vial']).optional(),
  label: optionalNullableString,
  dose_mg: optionalNullableNumber,
  concentration_mg_ml: optionalNullableNumber,
  volume_ml: optionalNullableNumber,
  doses_total: optionalNullableInt,
  doses_used: optionalNullableInt,
  status: z.enum(['sealed', 'in_use', 'finished']).optional(),
  opened_at: optionalDateString,
  expiry_date: optionalDateString,
  bud_date: optionalDateString,
  reorder_flag: z.boolean().optional(),
  reorder_threshold: optionalNullableInt,
  notes: optionalNullableString,
  source: z.string().optional(),
  custom_fields: customFields,
});
export const CreatePenBodySchema = PenFieldsSchema.loose();
export type CreatePenBody = z.infer<typeof CreatePenBodySchema>;
export const UpdatePenBodySchema = PenFieldsSchema.partial().loose();
export type UpdatePenBody = z.infer<typeof UpdatePenBodySchema>;

// --------------------------------------------------------------------------
// Injections
// --------------------------------------------------------------------------
export const CreateInjectionBodySchema = z
  .object({
    medication_id: z.string().uuid(),
    pen_id: z.string().uuid().nullable().optional(),
    injected_at: z.string().nullable().optional(), // ISO timestamp
    entry_date: optionalDateString,
    site: optionalNullableString,
    dose_mg: optionalNullableNumber,
    notes: optionalNullableString,
    /** when true and a pen_id is given, increment that pen's doses_used in the same txn */
    deduct_pen: z.boolean().optional(),
    source: z.string().optional(),
    custom_fields: customFields,
  })
  .loose();
export type CreateInjectionBody = z.infer<typeof CreateInjectionBodySchema>;

// --------------------------------------------------------------------------
// Titration / taper steps
// --------------------------------------------------------------------------
export const CreateTitrationStepBodySchema = z
  .object({
    dose_mg: z.number(),
    dose_unit: z.string().optional(),
    start_date: optionalDateString,
    planned_weeks: optionalNullableInt,
    step_order: optionalNullableInt,
    status: z.enum(['done', 'active', 'planned']).optional(),
    is_taper: z.boolean().optional(),
    note: optionalNullableString,
    source: z.string().optional(),
    custom_fields: customFields,
  })
  .loose();
export type CreateTitrationStepBody = z.infer<
  typeof CreateTitrationStepBodySchema
>;

// --------------------------------------------------------------------------
// Param / query schemas
// --------------------------------------------------------------------------
export const MedicationIdParamSchema = z
  .object({ medicationId: z.string().uuid() })
  .loose();
export type MedicationIdParam = z.infer<typeof MedicationIdParamSchema>;

export const ListMedicationsQuerySchema = z
  .object({
    glp1Only: z.coerce.boolean().optional(),
    activeOnly: z.coerce.boolean().optional(),
  })
  .loose();
export type ListMedicationsQuery = z.infer<typeof ListMedicationsQuerySchema>;

export const SerumCurveQuerySchema = z
  .object({
    fromDay: z.coerce.number().optional(),
    toDay: z.coerce.number().optional(),
    stepDays: z.coerce.number().optional(),
  })
  .loose();
export type SerumCurveQuery = z.infer<typeof SerumCurveQuerySchema>;

// --------------------------------------------------------------------------
// Medication Entries
// --------------------------------------------------------------------------
export const CreateMedicationEntryBodySchema = z
  .object({
    medication_id: z.string().uuid(),
    schedule_id: z.string().uuid().nullable().optional(),
    status: z.enum(['taken', 'skipped', 'snoozed', 'prn_taken']).optional(),
    taken_at: z.string().nullable().optional(),
    scheduled_for: z.string().nullable().optional(),
    entry_date: optionalDateString,
    med_name_snapshot: optionalNullableString,
    dose_amount_snapshot: optionalNullableNumber,
    dose_unit_snapshot: optionalNullableString,
    notes: optionalNullableString,
    source: z.string().optional(),
    custom_fields: customFields,
  })
  .loose();
export type CreateMedicationEntryBody = z.infer<
  typeof CreateMedicationEntryBodySchema
>;

export const ListMedicationEntriesQuerySchema = z
  .object({
    fromDate: optionalDateString,
    toDate: optionalDateString,
    medicationId: z.string().uuid().optional(),
  })
  .loose();
export type ListMedicationEntriesQuery = z.infer<
  typeof ListMedicationEntriesQuerySchema
>;

// --------------------------------------------------------------------------
// Display Preferences
// --------------------------------------------------------------------------
export const UpdateMedicationDisplayPreferencesBodySchema = z
  .object({
    visible_items: z.array(z.string()),
  })
  .loose();
export type UpdateMedicationDisplayPreferencesBody = z.infer<
  typeof UpdateMedicationDisplayPreferencesBodySchema
>;

export const DisplayPreferenceParamsSchema = z.object({
  viewGroup: z.string().min(1).max(50),
  platform: z.string().min(1).max(20),
});
export type DisplayPreferenceParams = z.infer<
  typeof DisplayPreferenceParamsSchema
>;
