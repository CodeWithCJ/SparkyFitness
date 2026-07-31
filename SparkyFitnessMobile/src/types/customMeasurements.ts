export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type?: string | null;
  /** Hidden categories are filtered out of input screens and the daily summary. */
  is_visible?: boolean;
  /** Ascending display order; the server fills defaults when omitted. */
  sort_order?: number;
  updated_at?: string;
}

/**
 * Shape of the nested `custom_categories` object the server embeds in every
 * custom-entry row. The repository builds it with `json_build_object`; it
 * carries the category's display metadata plus `id`, `is_visible`, and
 * `sort_order` so consumers can filter/sort entries without an extra lookup.
 */
export interface CustomCategoryEntryInfo {
  id?: string;
  name: string;
  display_name: string | null;
  measurement_type: string;
  frequency: string;
  data_type: string;
  is_visible?: boolean;
  sort_order?: number;
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
  custom_categories?: CustomCategoryEntryInfo;
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

export interface UpdateCustomMeasurementPayload {
  value?: string | number | boolean;
  notes?: string;
  source?: string;
}
