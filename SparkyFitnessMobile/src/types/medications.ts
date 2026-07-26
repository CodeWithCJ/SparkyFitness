export interface MedicationSchedule {
  id: string;
  medication_id: string;
  schedule_type_id: string;
  time_of_day?: string | null;
  days_of_week?: number[] | null;
  interval_days?: number | null;
  day_of_month?: number | null;
  cycle_on_days?: number | null;
  cycle_off_days?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  active: boolean;
  dose_amount?: number | null;
  with_meal?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Medication {
  id: string;
  user_id: string;
  name: string;
  type_id: string;
  route_type_id?: string | null;
  strength_value?: number | null;
  strength_unit?: string | null;
  dose_amount?: number | null;
  dose_unit?: string | null;
  reason?: string | null;
  prescriber?: string | null;
  pharmacy?: string | null;
  rx_number?: string | null;
  notes?: string | null;
  is_glp1: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicationDetail extends Medication {
  schedules: MedicationSchedule[];
}

export type MedicationEntryStatus = 'taken' | 'skipped' | 'snoozed' | 'prn_taken';

export interface MedicationEntry {
  id: string;
  user_id: string;
  medication_id: string;
  schedule_id?: string | null;
  status: MedicationEntryStatus;
  entry_date: string;
  taken_at?: string | null;
  dose_amount?: number | null;
  unit?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMedicationEntryInput {
  medication_id: string;
  schedule_id?: string | null;
  status: MedicationEntryStatus;
  entry_date: string;
  taken_at?: string | null;
  dose_amount?: number | null;
  unit?: string | null;
  notes?: string | null;
}

export interface CreateMedicationInput {
  name: string;
  type_id: string;
  route_type_id?: string | null;
  strength_value?: number | null;
  strength_unit?: string | null;
  dose_amount?: number | null;
  dose_unit?: string | null;
  reason?: string | null;
  prescriber?: string | null;
  pharmacy?: string | null;
  rx_number?: string | null;
  notes?: string | null;
  is_glp1?: boolean;
  is_active?: boolean;
}

export interface UpdateMedicationInput {
  name?: string;
  type_id?: string;
  route_type_id?: string | null;
  strength_value?: number | null;
  strength_unit?: string | null;
  dose_amount?: number | null;
  dose_unit?: string | null;
  reason?: string | null;
  prescriber?: string | null;
  pharmacy?: string | null;
  rx_number?: string | null;
  notes?: string | null;
  is_glp1?: boolean;
  is_active?: boolean;
}

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
