// Shared types for the medication / GLP-1 module. Kept in src/types so both the
// api service (src/api) and page components can import them (page components are
// not allowed to import from src/api directly — see eslint no-restricted-imports).

import type {
  FoodVariantNutrientField,
  MedicationWithMeal,
} from '@workspace/shared';

/**
 * A supplement's per-dose payload: the fixed food-variant nutrient columns plus the
 * user's own custom nutrients. Keyed off the shared field list so it cannot drift from
 * what the report and the nutrient grid actually read.
 */
export type MedicationNutrients = Partial<
  Record<FoodVariantNutrientField, number>
> & { custom_nutrients?: Record<string, number> };

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
  is_supplement: boolean;
  nutrients: MedicationNutrients;
  notes: string | null;
  source: string;
  prescriber?: string | null;
  pharmacy?: string | null;
  rx_number?: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  schedules?: MedicationSchedule[];
}

export interface MedicationSchedule {
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
  with_meal: MedicationWithMeal | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type MedicationDetail = Medication & { schedules: MedicationSchedule[] };

export type {
  MedicationPen,
  InjectionEntry,
  TitrationStep,
  SerumPoint,
  SerumCurveResponse,
  SiteSuggestionResponse,
  LogInjectionInput,
  UpdateInjectionInput,
  UpdateTitrationStepInput,
} from '@workspace/shared';

export interface ListMedicationsOptions {
  glp1Only?: boolean;
  activeOnly?: boolean;
}

export interface MedicationEntry {
  id: string;
  medication_id: string;
  schedule_id: string | null;
  user_id: string;
  status: 'taken' | 'skipped' | 'snoozed' | 'prn_taken';
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
   * Per-dose nutrient payload snapshotted at log time (server-derived from the
   * medication for supplement entries). NULL for non-supplement entries. Read-only;
   * not client-writable on create.
   */
  nutrients_snapshot?: MedicationNutrients | null;
  /**
   * 'injection' rows are GLP-1 injection logs merged into the entries feed by the server;
   * their id is an injection id, so deletes must go through the injection endpoint.
   */
  entry_type?: 'entry' | 'injection';
  /** Injection site — only populated on entry_type='injection' rows. */
  site?: string | null;
}

export interface CreateMedicationEntryInput {
  medication_id: string;
  schedule_id?: string | null;
  status?: 'taken' | 'skipped' | 'snoozed' | 'prn_taken';
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
  status?: 'taken' | 'skipped' | 'snoozed' | 'prn_taken';
  taken_at?: string | null;
  scheduled_for?: string | null;
  entry_date?: string | null;
  notes?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export interface ListMedicationEntriesOptions {
  fromDate?: string;
  toDate?: string;
  medicationId?: string;
}
