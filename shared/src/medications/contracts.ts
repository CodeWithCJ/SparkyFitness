import type { SharedScheduleRule } from './schedules.ts';

// Contract types for the v2 medications API (/api/v2/medications). Field
// names mirror the server's medicationSchemas.ts and repository columns —
// snake_case, straight from the database.

export type MedicationEntryStatus = 'taken' | 'skipped' | 'snoozed' | 'prn_taken';

export interface Medication {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  type_id: string | null;
  route_id: string | null;
  strength_value: number | null;
  strength_unit: string | null;
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
  dose_amount: number | null;
  days_of_week: number[] | null;
  interval_days: number | null;
  day_of_month: number | null;
  cycle_on_days: number | null;
  cycle_off_days: number | null;
  prn_reason: string | null;
  prn_max_per_day: number | null;
  with_meal: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type MedicationDetail = Medication & { schedules: MedicationSchedule[] };

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
