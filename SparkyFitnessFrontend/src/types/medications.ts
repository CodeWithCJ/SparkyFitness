// Shared types for the medication / GLP-1 module. Kept in src/types so both the
// api service (src/api) and page components can import them (page components are
// not allowed to import from src/api directly — see eslint no-restricted-imports).

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
  with_meal: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
}

export type MedicationDetail = Medication & { schedules: MedicationSchedule[] };

export interface MedicationPen {
  id: string;
  medication_id: string;
  kind: 'pen' | 'vial';
  label: string | null;
  dose_mg: number | null;
  concentration_mg_ml: number | null;
  volume_ml: number | null;
  doses_total: number | null;
  doses_used: number;
  status: 'sealed' | 'in_use' | 'finished';
  opened_at: string | null;
  expiry_date: string | null;
  bud_date: string | null;
  reorder_flag: boolean;
  reorder_threshold: number | null;
  notes: string | null;
}

export interface InjectionEntry {
  id: string;
  medication_id: string;
  pen_id: string | null;
  injected_at: string;
  entry_date: string;
  site: string | null;
  dose_mg: number | null;
  notes: string | null;
}

export interface TitrationStep {
  id: string;
  medication_id: string;
  dose_mg: number;
  dose_unit: string;
  start_date: string | null;
  planned_weeks: number | null;
  step_order: number;
  status: 'done' | 'active' | 'planned';
  is_taper: boolean;
  note: string | null;
}

export interface SerumPoint {
  day: number;
  level: number;
  fraction: number;
}

export interface SerumCurveResponse {
  drugId: string | null;
  drugName?: string | null;
  curve: SerumPoint[];
  currentLevelFraction: number | null;
  /** Day positions of logged injections (relative to the curve anchor), for chart markers. */
  doseDays: number[];
  disclaimer: string;
}

export interface SiteSuggestionResponse {
  suggestedSiteId: string;
  restingSiteIds: string[];
  sites: { id: string; label: string; region: string; side: string }[];
  restDays: number;
  /** User's customized active site ids (ordered), or null if using defaults. */
  activeSiteIds: string[] | null;
}

export interface ListMedicationsOptions {
  glp1Only?: boolean;
  activeOnly?: boolean;
}

export interface LogInjectionInput {
  medication_id: string;
  /** Omit while deduct_pen is true to let the server auto-pick the pen (in-use first, else oldest sealed). */
  pen_id?: string | null;
  injected_at?: string;
  entry_date?: string | null;
  site?: string | null;
  /** Omit to let the server resolve it from the active titration step or the medication's default dose. */
  dose_mg?: number | null;
  deduct_pen?: boolean;
  notes?: string | null;
}

// pen_id/deduct_pen are deliberately not editable — delete and re-log to change the pen.
export interface UpdateInjectionInput {
  injected_at?: string;
  entry_date?: string | null;
  site?: string | null;
  dose_mg?: number | null;
  notes?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export type UpdateTitrationStepInput = Partial<
  Omit<TitrationStep, 'id' | 'medication_id'>
>;

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
