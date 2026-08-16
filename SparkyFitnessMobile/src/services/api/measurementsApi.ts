import { apiFetch } from './apiClient';
import { getTodayDate } from '../../utils/dateUtils';
import type { CheckInMeasurement, CheckInMeasurementRange, WaterIntake, WaterContainer, WaterIntakeResponse } from '../../types/measurements';
import type { CustomCategory, CustomMeasurementEntry, SaveCustomMeasurementPayload } from '../../types/customMeasurements';

/**
 * Fetches measurements for a given date.
 *
 * The `/check-in/:date` endpoint carries forward the latest value per field
 * (intentional server behavior for the web editor). The mobile diary/editor
 * need exactly what was recorded on this day, so query the range endpoint for
 * a single day — a plain `WHERE entry_date = date` with no carry-forward.
 */
export const fetchMeasurements = async (date: string): Promise<CheckInMeasurement> => {
  const rows = await fetchMeasurementsRange(date, date);
  return (rows?.[0] ?? {}) as CheckInMeasurement;
};

/**
 * Fetches water intake for a given date.
 */
export const fetchWaterIntake = async (date: string): Promise<WaterIntake> => {
  return apiFetch<WaterIntake>({
    endpoint: `/api/measurements/water-intake/${date}`,
    serviceName: 'Measurements API',
    operation: 'fetch water intake',
  });
};

let lastPerRecordWaterSupport: boolean | null = null;

/**
 * Whether the active server accepts per-record water sync (upsert by
 * source_id). Older servers instead SET the day total per incoming record, so
 * sending individual drinks against one would leave the day at the last
 * drink's volume — callers fall back to a single day-aggregate record there.
 *
 * Feature detection, not a version check: the same server release that added
 * per-record ingestion also added the `manual_ml` breakdown to the day-totals
 * endpoint, so its presence identifies exactly the right deploy. On probe
 * failure the last successful answer is reused (the sync that needed it is
 * about to fail on the same network anyway); first-ever probe failures assume
 * support, matching current-release servers.
 */
export const serverSupportsPerRecordWater = async (): Promise<boolean> => {
  try {
    const totals = await fetchWaterIntake(getTodayDate());
    lastPerRecordWaterSupport =
      totals != null && typeof totals === 'object' && 'manual_ml' in totals;
  } catch {
    if (lastPerRecordWaterSupport === null) return true;
  }
  return lastPerRecordWaterSupport;
};

/**
 * Fetches available water containers.
 */
export const fetchWaterContainers = async (): Promise<WaterContainer[]> => {
  return apiFetch<WaterContainer[]>({
    endpoint: '/api/water-containers',
    serviceName: 'Measurements API',
    operation: 'fetch water containers',
  });
};

/**
 * Fetches measurements for a date range.
 */
export const fetchMeasurementsRange = async (startDate: string, endDate: string): Promise<CheckInMeasurementRange[]> => {
  return apiFetch<CheckInMeasurementRange[]>({
    endpoint: `/api/measurements/check-in-measurements-range/${startDate}/${endDate}`,
    serviceName: 'Measurements API',
    operation: 'fetch measurements range',
  });
};

/**
 * Upserts a check-in measurement record for a given date.
 *
 * `undefined` fields are stripped by `JSON.stringify` and left unchanged
 * server-side. Pass `null` to explicitly clear a previously-saved value.
 */
export const upsertCheckIn = async (params: {
  entryDate: string;
  weight?: number | null;
  neck?: number | null;
  waist?: number | null;
  hips?: number | null;
  steps?: number | null;
  height?: number | null;
  bodyFatPercentage?: number | null;
}): Promise<CheckInMeasurement> => {
  return apiFetch<CheckInMeasurement>({
    endpoint: '/api/measurements/check-in',
    serviceName: 'Measurements API',
    operation: 'upsert check-in',
    method: 'POST',
    body: {
      entry_date: params.entryDate,
      weight: params.weight,
      neck: params.neck,
      waist: params.waist,
      hips: params.hips,
      steps: params.steps,
      height: params.height,
      body_fat_percentage: params.bodyFatPercentage,
    },
  });
};

export const fetchCustomCategories = async (): Promise<CustomCategory[]> => {
  return apiFetch<CustomCategory[]>({
    endpoint: '/api/measurements/custom-categories',
    serviceName: 'Measurements API',
    operation: 'fetch custom categories',
  });
};

export const fetchCustomMeasurementsByDate = async (date: string): Promise<CustomMeasurementEntry[]> => {
  return apiFetch<CustomMeasurementEntry[]>({
    endpoint: `/api/measurements/custom-entries/${date}`,
    serviceName: 'Measurements API',
    operation: 'fetch custom measurements by date',
  });
};

export const saveCustomMeasurement = async (payload: SaveCustomMeasurementPayload): Promise<CustomMeasurementEntry> => {
  return apiFetch<CustomMeasurementEntry>({
    endpoint: '/api/measurements/custom-entries',
    serviceName: 'Measurements API',
    operation: 'save custom measurement',
    method: 'POST',
    body: {
      category_id: payload.category_id,
      value: payload.value,
      entry_date: payload.entry_date,
      entry_hour: payload.entry_hour,
      entry_timestamp: payload.entry_timestamp,
      notes: payload.notes,
      source: payload.source,
    },
  });
};

export const deleteCustomMeasurement = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/measurements/custom-entries/${id}`,
    serviceName: 'Measurements API',
    operation: 'delete custom measurement',
    method: 'DELETE',
  });
};

/**
 * Changes water intake by adding or removing a drink.
 */
export const changeWaterIntake = async (params: {
  entryDate: string;
  changeDrinks: number;
  containerId: number;
}): Promise<WaterIntakeResponse> => {
  return apiFetch<WaterIntakeResponse>({
    endpoint: '/api/measurements/water-intake',
    serviceName: 'Measurements API',
    operation: 'change water intake',
    method: 'POST',
    body: {
      entry_date: params.entryDate,
      change_drinks: params.changeDrinks,
      container_id: params.containerId,
    },
  });
};
