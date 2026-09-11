export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type?: string | null;
  updated_at?: string;
}

/**
 * Shape of the nested `custom_categories` object the server embeds in every
 * custom-entry row. The repository builds it with `json_build_object` and does
 * NOT include `id` (or any other category column beyond the ones listed here),
 * so this must stay a separate type instead of reusing `CustomCategory`.
 */
export interface CustomCategoryEntryInfo {
  name: string;
  display_name: string | null;
  measurement_type: string;
  frequency: string;
  data_type: string;
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

/**
 * One row of the per-category "latest manual value on or before a date" lookup
 * that backs previous-value hints.
 *
 * The shape is owned by `@workspace/shared` because the web check-in consumes
 * the same endpoint; re-exported here so existing importers keep their path and
 * the two clients cannot drift apart.
 */
export type { LatestManualCustomEntry } from '@workspace/shared';
