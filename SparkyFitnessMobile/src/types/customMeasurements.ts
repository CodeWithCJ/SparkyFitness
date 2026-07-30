export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type?: string | null;
  updated_at?: string;
}

export interface CustomMeasurementEntry {
  id: string;
  category_id: string;
  value: string;
  entry_date: string;
  entry_hour?: number | null;
  entry_timestamp?: string;
  notes?: string | null;
  source?: string;
  custom_categories?: CustomCategory;
}

export interface SaveCustomMeasurementPayload {
  category_id: string;
  value: string | number | boolean;
  entry_date: string;
  entry_hour?: number | null;
  entry_timestamp?: string;
  notes?: string;
  source?: string;
}
