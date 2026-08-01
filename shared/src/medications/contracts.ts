import type { SharedScheduleRule } from './schedules.ts';

// Contract types for the v2 medications API (/api/v2/medications). Field
// names mirror the server's medicationSchemas.ts and repository columns —
// snake_case, straight from the database.

export type MedicationEntryStatus = 'taken' | 'skipped' | 'snoozed' | 'prn_taken';

/** Meal timing for a scheduled dose, relative to the nearest meal. */
export type MedicationWithMeal = 'before' | 'with' | 'after';

export interface Medication {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  type_id: string | null;
  route_id: string | null;
  /**
   * Per-unit concentration of the medication (e.g. 500 mg per tablet), not
   * an amount to take. Display it as secondary information under the dose.
   */
  strength_value: number | null;
  strength_unit: string | null;
  /**
   * Default amount taken per administration, in dose_unit (e.g. 2 tablet).
   * Rows created by the web app may carry dose mirrored from strength
   * (dose ≡ strength, in strength units); such rows are valid and mean
   * "one unit per dose". Display precedence for a dose slot is
   * schedule.dose_amount → dose_amount → strength_value (see formatDose).
   */
  dose_amount: number | null;
  dose_unit: string | null;
  reason_text: string | null;
  effectiveness_rating: number | null;
  color: string | null;
  icon: string | null;
  photo_path: string | null;
  is_active: boolean;
  is_quick: boolean;
  is_glp1: boolean;
  notes: string | null;
  source: string;
  rxnorm_rxcui?: string | null;
  ndc?: string | null;
  prescriber?: string | null;
  pharmacy?: string | null;
  rx_number?: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  schedules?: MedicationSchedule[];
}

export interface MedicationSchedule extends SharedScheduleRule {
  id: string;
  medication_id: string;
  schedule_type_id: string;
  time_of_day: string | null;
  /**
   * Per-schedule override of the medication's default dose_amount,
   * implicitly in the medication's dose_unit — there is no unit column.
   */
  dose_amount: number | null;
  days_of_week: number[] | null;
  interval_days: number | null;
  day_of_month: number | null;
  cycle_on_days: number | null;
  cycle_off_days: number | null;
  prn_reason: string | null;
  prn_max_per_day: number | null;
  with_meal: MedicationWithMeal | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type MedicationDetail = Medication & { schedules: MedicationSchedule[] };

export interface CreateScheduleInput {
  schedule_type_id: string;
  /** 'HH:MM' or 'HH:MM:SS'. Null for schedules without a fixed time (e.g. PRN). */
  time_of_day?: string | null;
  dose_amount?: number | null;
  days_of_week?: number[] | null;
  interval_days?: number | null;
  day_of_month?: number | null;
  cycle_on_days?: number | null;
  cycle_off_days?: number | null;
  with_meal?: MedicationWithMeal | null;
  prn_reason?: string | null;
  prn_max_per_day?: number | null;
  /** 'YYYY-MM-DD' calendar-day string. */
  start_date?: string | null;
  /** 'YYYY-MM-DD' calendar-day string. */
  end_date?: string | null;
  active?: boolean;
  source?: string;
  custom_fields?: Record<string, unknown> | null;
}

/** source is set at creation and never updateable — the server ignores it on update. */
export type UpdateScheduleInput = Partial<Omit<CreateScheduleInput, 'source'>>;

export interface CreateMedicationInput {
  name: string;
  display_name?: string | null;
  type_id?: string | null;
  route_id?: string | null;
  strength_value?: number | null;
  strength_unit?: string | null;
  dose_amount?: number | null;
  dose_unit?: string | null;
  rxnorm_rxcui?: string | null;
  ndc?: string | null;
  prescriber?: string | null;
  pharmacy?: string | null;
  rx_number?: string | null;
  reason_text?: string | null;
  effectiveness_rating?: number | null;
  color?: string | null;
  icon?: string | null;
  photo_path?: string | null;
  is_active?: boolean;
  is_quick?: boolean;
  is_glp1?: boolean;
  notes?: string | null;
  source?: string;
  custom_fields?: Record<string, unknown>;
}

export type UpdateMedicationInput = Partial<CreateMedicationInput>;

export interface MedicationEntry {
  id: string;
  medication_id: string;
  schedule_id: string | null;
  user_id: string;
  status: MedicationEntryStatus;
  taken_at: string;
  scheduled_for: string | null;
  entry_date: string;
  med_name_snapshot: string | null;
  dose_amount_snapshot: number | null;
  dose_unit_snapshot: string | null;
  notes: string | null;
  source: string;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  /**
   * 'injection' rows are GLP-1 injection logs merged into the entries feed by
   * the server; their id is an injection id, so deletes must go through the
   * injection endpoint.
   */
  entry_type?: 'entry' | 'injection';
  /** Injection site — only populated on entry_type='injection' rows. */
  site?: string | null;
}

export interface CreateMedicationEntryInput {
  medication_id: string;
  schedule_id?: string | null;
  status?: MedicationEntryStatus;
  taken_at?: string | null;
  scheduled_for?: string | null;
  entry_date?: string | null;
  med_name_snapshot?: string | null;
  dose_amount_snapshot?: number | null;
  dose_unit_snapshot?: string | null;
  notes?: string | null;
  source?: string;
  custom_fields?: Record<string, unknown> | null;
}

export interface UpdateMedicationEntryInput {
  schedule_id?: string | null;
  status?: MedicationEntryStatus;
  taken_at?: string | null;
  scheduled_for?: string | null;
  entry_date?: string | null;
  notes?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export interface ListMedicationsOptions {
  glp1Only?: boolean;
  activeOnly?: boolean;
}

export interface ListMedicationEntriesOptions {
  fromDate?: string;
  toDate?: string;
  medicationId?: string;
}
